/**
 * GET /api/v1/quran/ayah-audio?reciter=<id>&surah=<n>&ayah=<n> → the reciter's ayah file (EveryAyah), served from
 * our origin so the browser can measure its silence (src/lib/quran/ayah-clip.ts). Cached for good by the CDN.
 */
import { RECITERS, reciterAudioUrl } from "@/lib/quran/reciter-list";
import { getSurahMeta } from "@/lib/quran/surahs";
import { apiError } from "@/server/errors";
import { parseSurahParam, route } from "@/server/http";

export const runtime = "nodejs";

const MAX_BYTES = 4_000_000; // stays under the platform's response limit; bigger files are played directly

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const reciter = RECITERS.find((r) => r.id === q.get("reciter"));
  const n = parseSurahParam(q.get("surah") ?? "");
  const ayah = Number(q.get("ayah"));
  const meta = getSurahMeta(n);
  if (!reciter || !meta || !Number.isInteger(ayah) || ayah < 1 || ayah > meta.ayahCount) throw apiError(404, "not_found");
  const res = await fetch(reciterAudioUrl(reciter, n, ayah), { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) throw apiError(502, "internal", "تعذّر تحميل ملف التلاوة.");
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw apiError(413, "payload_too_large", "الملف كبير؛ يُشغَّل مباشرة.");
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw apiError(413, "payload_too_large", "الملف كبير؛ يُشغَّل مباشرة.");
  return new Response(body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "audio/mpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});
