/**
 * Ayah-by-ayah files (EveryAyah) carry silence at their start and end, so playing them one after another sounds cut:
 * a pause, then a new start. For reciters without a whole-surah recording, each ayah file is fetched through our
 * server (same origin, so the browser can read it), decoded once, and the silence at both ends is measured. The
 * player then starts at the voice and moves on just after it ends, keeping a short natural breath between ayahs.
 */

export interface AyahClip {
  /** what the player loads: the fetched file (blob:) or, when it could not be fetched, the original URL */
  src: string;
  /** where the voice starts and (when known) where to move on, in seconds */
  start: number;
  end: number | null;
}

/** silence kept before the voice and after it (a breath between ayahs, as in a continuous recitation) */
const LEAD_KEEP = 0.08;
const TAIL_KEEP = 0.3;

/** First and last moment with voice in the samples (seconds), or null when it is all silence. */
export function voiceBounds(samples: Float32Array, sampleRate: number): { first: number; last: number } | null {
  const win = Math.max(1, Math.round(sampleRate * 0.02));
  let peak = 0;
  for (let k = 0; k < samples.length; k++) peak = Math.max(peak, Math.abs(samples[k]));
  if (peak === 0) return null;
  const threshold = Math.max(0.006, peak * 0.06);
  const loud = (w: number) => {
    let sum = 0;
    const end = Math.min(samples.length, w + win);
    for (let k = w; k < end; k++) sum += samples[k] * samples[k];
    return Math.sqrt(sum / Math.max(1, end - w)) >= threshold;
  };
  let first = -1;
  for (let w = 0; w < samples.length; w += win) if (loud(w)) { first = w; break; }
  if (first < 0) return null;
  let last = first;
  for (let w = Math.floor((samples.length - 1) / win) * win; w >= first; w -= win) if (loud(w)) { last = Math.min(samples.length, w + win); break; }
  return { first: first / sampleRate, last: last / sampleRate };
}

export function clipTimes(bounds: { first: number; last: number } | null, duration: number): { start: number; end: number | null } {
  if (!bounds) return { start: 0, end: null };
  return { start: Math.max(0, bounds.first - LEAD_KEEP), end: Math.min(duration, bounds.last + TAIL_KEEP) };
}

// ── Browser side: fetch, measure, keep the last few ──

const loads = new Map<string, Promise<AyahClip>>();
const done = new Map<string, AyahClip>();
const MAX_KEPT = 24;

/** A clip measured already, or undefined (not asked or still loading). */
export function readyClip(url: string): AyahClip | undefined {
  return done.get(url);
}

/** `url`: the ayah file; `via`: the same file through our server. Never rejects: on any failure, the plain file. */
export function loadAyahClip(url: string, via: string): Promise<AyahClip> {
  let p = loads.get(url);
  if (p) return p;
  p = (async (): Promise<AyahClip> => {
    try {
      const res = await fetch(via);
      if (!res.ok) throw new Error(String(res.status));
      const bytes = await res.arrayBuffer();
      const src = URL.createObjectURL(new Blob([bytes], { type: res.headers.get("content-type") ?? "audio/mpeg" }));
      try {
        const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
        const buf = await new Ctx(1, 1, 22050).decodeAudioData(bytes.slice(0));
        return { src, ...clipTimes(voiceBounds(buf.getChannelData(0), buf.sampleRate), buf.duration) };
      } catch {
        return { src, start: 0, end: null };
      }
    } catch {
      return { src: url, start: 0, end: null };
    }
  })().then((clip) => {
    done.set(url, clip);
    // keep memory small: forget the oldest clips
    while (done.size > MAX_KEPT) {
      const [old, c] = done.entries().next().value as [string, AyahClip];
      done.delete(old);
      loads.delete(old);
      if (c.src.startsWith("blob:")) URL.revokeObjectURL(c.src);
    }
    return clip;
  });
  loads.set(url, p);
  return p;
}
