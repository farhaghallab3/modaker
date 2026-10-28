/**
 * Client for the free tajweed checker (services/tajweed). Sends the recording and the ayah range only;
 * the checker builds the correct reading itself. Audio is not kept on either side.
 */
import { env } from "@/server/env";
import { ProviderError } from "@/server/errors";
import { parseTajweedResult, type TajweedResult } from "@/lib/recitation/tajweed-notes";
import type { AyahRange } from "@/lib/types";

export function tajweedConfigured(): boolean {
  return Boolean(env.tajweedUrl() && env.tajweedKey());
}

/** Pings the checker so a sleeping free Space starts waking while the learner recites. Never throws, never waits long. */
export async function wakeTajweed(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl(`${env.tajweedUrl()}/`, { signal: AbortSignal.timeout(1500) });
  } catch {
    /* asleep or slow: the ping already started it */
  }
}

/** A sleeping free server can take a minute to wake; the screen keeps showing «جارٍ فحص التجويد» meanwhile. */
const TIMEOUT_MS = 55_000;

export async function checkTajweed(audio: ArrayBuffer, mimeType: string, range: AyahRange, fetchImpl: typeof fetch = fetch): Promise<TajweedResult> {
  const fd = new FormData();
  const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
  fd.append("audio", new Blob([audio], { type: mimeType }), `recitation.${ext}`);
  fd.append("surah", String(range.surah));
  fd.append("from", String(range.from));
  fd.append("to", String(range.to));

  let res: Response;
  try {
    res = await fetchImpl(`${env.tajweedUrl()}/check`, {
      method: "POST",
      headers: { "x-modaker-key": env.tajweedKey() },
      body: fd,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new ProviderError("tajweed", `request failed: ${(e as Error).name}`, undefined, { cause: e });
  }
  if (!res.ok) throw new ProviderError("tajweed", `HTTP ${res.status}`, res.status);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ProviderError("tajweed", "bad JSON");
  }
  return parseTajweedResult(body, range);
}
