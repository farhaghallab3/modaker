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

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  // Optional: GPU time is then counted on the Space owner's free quota instead of the anonymous one.
  const token = env.tajweedHfToken();
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

/** The `complete` event's data from a Gradio server-sent-events answer (null when it reported an error). */
export function gradioComplete(stream: string): unknown {
  let event = "";
  for (const line of stream.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:") && event === "complete") {
      try {
        const data = JSON.parse(line.slice(5).trim());
        return Array.isArray(data) ? data[0] : data;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Asks the checker (a Gradio Space) in its two steps: start the job, then read its result.
 * Only the recording (base64), the ayah range and the shared key are sent.
 */
export async function checkTajweed(audio: ArrayBuffer, _mimeType: string, range: AyahRange, fetchImpl: typeof fetch = fetch): Promise<TajweedResult> {
  const base = `${env.tajweedUrl()}/gradio_api/call/check`;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const data = [Buffer.from(audio).toString("base64"), range.surah, range.from, range.to, env.tajweedKey()];

  let stream: string;
  try {
    const start = await fetchImpl(base, { method: "POST", headers: headers(), body: JSON.stringify({ data }), signal });
    if (!start.ok) throw new ProviderError("tajweed", `HTTP ${start.status}`, start.status);
    const { event_id: id } = (await start.json()) as { event_id?: unknown };
    if (typeof id !== "string" || !/^[\w-]{1,100}$/.test(id)) throw new ProviderError("tajweed", "no event id");
    const res = await fetchImpl(`${base}/${id}`, { headers: headers(), signal });
    if (!res.ok) throw new ProviderError("tajweed", `HTTP ${res.status}`, res.status);
    stream = await res.text();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError("tajweed", `request failed: ${(e as Error).name}`, undefined, { cause: e });
  }
  const result = gradioComplete(stream) as { ok?: unknown; error?: unknown } | null;
  if (!result || result.ok !== true) throw new ProviderError("tajweed", `checker said: ${String(result?.error ?? "error")}`);
  return parseTajweedResult(result, range);
}
