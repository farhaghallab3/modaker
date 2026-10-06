"use client";

/**
 * Typed client for the versioned REST API (/api/v1). The same endpoints are
 * the contract for the future mobile app — see docs/ARCHITECTURE.md §5.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  AssistantAnswer,
  AyahRange,
  RecitationAnalysis,
  SurahText,
  TafsirEntry,
  Transcript,
  SourceRef,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? res.statusText, res.status, body.code);
  }
  return res.json() as Promise<T>;
}

const BASE = "/api/v1";

export const api = {
  surah: (n: number) => fetch(`${BASE}/quran/surahs/${n}`).then((r) => json<SurahText>(r)),
  tafsir: (n: number, source = "muyassar") =>
    fetch(`${BASE}/quran/surahs/${n}/tafsir?source=${source}`).then((r) => json<{ entries: TafsirEntry[]; source: SourceRef }>(r)),
  transcribe: (audio: Blob, range: AyahRange) => {
    const fd = new FormData();
    const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", audio, `recitation.${ext}`);
    fd.append("range", JSON.stringify(range));
    return fetch(`${BASE}/recitation/transcribe`, { method: "POST", body: fd }).then((r) => json<Transcript>(r));
  },
  /** The server loads the expected verses itself; the client only sends the range. */
  analyze: (range: AyahRange, transcript: Transcript) =>
    fetch(`${BASE}/recitation/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ range, transcript }),
    }).then((r) => json<RecitationAnalysis>(r)),
  ask: (question: string, context?: { surah?: number; ayah?: number; storySlug?: string }) =>
    fetch(`${BASE}/assistant/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, context }),
    }).then((r) => json<AssistantAnswer>(r)),
  /** Spoken answer (MP3). Only text the server signed on a real assistant answer is accepted. */
  speech: async (speech: { text: string; exp: number; sig: string }): Promise<Blob> => {
    const res = await fetch(`${BASE}/assistant/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(speech),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.error ?? res.statusText, res.status, body.code);
    }
    return res.blob();
  },
  subscribePush: (subscription: PushSubscriptionJSON) =>
    fetch(`${BASE}/notifications/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription }),
    }).then((r) => json<{ ok: true }>(r)),
};

/** Minimal data hook with loading / error / retry states. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, retry };
}

export function useSurah(n: number) {
  return useAsync(() => api.surah(n), [n]);
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
