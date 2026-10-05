"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApp } from "@/lib/store/AppProvider";

export type PushStatus =
  | "checking"
  | "unsupported" // browser lacks SW / Push / Notification
  | "not-configured" // no NEXT_PUBLIC_VAPID_PUBLIC_KEY in this deployment
  | "denied" // the learner blocked notifications for this site
  | "off"
  | "on";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Web Push lifecycle: permission → register /sw.js → PushManager.subscribe(VAPID)
 * → POST /notifications/subscribe. Mirrors the result into notificationPrefs.pushEnabled.
 */
export function usePushSubscription() {
  const { state, actions } = useApp();
  const [status, setStatus] = useState<PushStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supported()) return setStatus("unsupported");
      if (!VAPID) return setStatus("not-configured");
      if (Notification.permission === "denied") return setStatus("denied");
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (alive) setStatus(sub && Notification.permission === "granted" ? "on" : "off");
      } catch {
        if (alive) setStatus("off");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // keep the stored preference honest if the browser subscription disappeared
  useEffect(() => {
    if (status === "off" && state.notificationPrefs.pushEnabled) actions.updatePrefs({ pushEnabled: false });
    if (status === "on" && !state.notificationPrefs.pushEnabled) actions.updatePrefs({ pushEnabled: true });
  }, [status, state.notificationPrefs.pushEnabled, actions]);

  const enable = useCallback(async () => {
    setError(null);
    if (!supported()) return setStatus("unsupported");
    if (!VAPID) return setStatus("not-configured");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) }));
      try {
        await api.subscribePush(sub.toJSON());
      } catch (e) {
        await sub.unsubscribe().catch(() => {});
        if (e instanceof ApiError && (e.code === "push_not_configured" || e.code === "no_database" || e.status === 503)) {
          setStatus("not-configured");
          return;
        }
        if (e instanceof ApiError && e.status === 401) {
          setError("تنبيهات المتصفح تحتاج حسابًا متصلًا بالخادم. سجّل الدخول بحسابك ثم فعّلها.");
          setStatus("off");
          return;
        }
        throw e;
      }
      setStatus("on");
    } catch {
      setError("تعذّر تفعيل التنبيهات الآن. حاول مرة أخرى بعد قليل.");
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/v1/notifications/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => null);
        await sub.unsubscribe();
      }
    } catch {
      /* already gone */
    } finally {
      setStatus("off");
      setBusy(false);
    }
  }, []);

  return { status, busy, error, enable, disable };
}
