/**
 * Web Push channel (VAPID, via the `web-push` library). Expired subscriptions
 * (404/410) are deleted; repeated failures (≥ 5) are pruned too.
 */
import type { AppNotification } from "@/lib/types";
import { getPrisma } from "../db";
import { env } from "../env";
import { toPushPayload, type ChannelResult, type NotificationChannel } from "./channel";

type WebPushLib = typeof import("web-push");
let lib: WebPushLib | null = null;

async function webpush(): Promise<WebPushLib> {
  if (lib) return lib;
  const mod = (await import("web-push")) as WebPushLib & { default?: WebPushLib };
  lib = mod.default ?? mod;
  lib.setVapidDetails(env.vapidSubject(), env.vapidPublicKey(), env.vapidPrivateKey());
  return lib;
}

export function webPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey() && env.vapidPrivateKey());
}

export class WebPushChannel implements NotificationChannel {
  readonly id = "web-push";

  async send(userId: string, n: AppNotification): Promise<ChannelResult> {
    if (!webPushConfigured()) return { channel: this.id, delivered: 0, error: "not_configured" };
    const prisma = await getPrisma();
    const subs = await prisma.pushSubscription.findMany({ where: { userId, platform: "web" } });
    if (!subs.length) return { channel: this.id, delivered: 0 };

    const wp = await webpush();
    const payload = JSON.stringify(toPushPayload(n));
    let delivered = 0;

    await Promise.all(
      subs.map(async (s) => {
        if (!s.p256dh || !s.auth) return;
        try {
          await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 6 * 3600, // a reminder older than 6h is no longer useful
            urgency: "normal",
          });
          delivered++;
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410 || s.failureCount >= 4) {
            await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          } else {
            await prisma.pushSubscription.update({ where: { id: s.id }, data: { failureCount: { increment: 1 } } });
          }
        }
      }),
    );
    return { channel: this.id, delivered };
  }
}
