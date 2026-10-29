/**
 * GET /api/v1/quran/audio-timing?reciter=<id>&surah=<n> → SurahTiming: the reciter's whole-surah file and where each
 * ayah starts and ends in it (from mp3quran.net). 404 when there is none; the app then plays ayah by ayah.
 */
import { getSurahMeta } from "@/lib/quran/surahs";
import { SURAH_AUDIO, parseTimings, surahAudioUrl } from "@/lib/quran/surah-audio";
import { apiError } from "@/server/errors";
import { json, parseSurahParam, route } from "@/server/http";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const reciter = q.get("reciter") ?? "";
  const n = parseSurahParam(q.get("surah") ?? "");
  const src = SURAH_AUDIO[reciter];
  const url = surahAudioUrl(reciter, n);
  const meta = getSurahMeta(n);
  if (!src || !url || !meta) throw apiError(404, "not_found", "لا يتوفر ملف السورة لهذا القارئ.");
  const res = await fetch(`https://mp3quran.net/api/v3/ayat_timing?surah=${n}&read=${src.read}`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 60 * 60 * 24 * 30 },
  }).catch(() => null);
  const timing = res?.ok ? parseTimings(await res.json().catch(() => null), meta.ayahCount, url) : null;
  if (!timing) throw apiError(404, "not_found", "لا تتوفر أوقات الآيات لهذا القارئ.");
  // Recordings and their timings do not change: let browsers and the CDN keep them.
  return json(timing, { headers: { "cache-control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400" } });
});
