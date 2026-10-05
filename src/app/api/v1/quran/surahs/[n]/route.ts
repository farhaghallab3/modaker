/** GET /api/v1/quran/surahs/{n} → SurahText (verified text from the configured QuranProvider). */
import { json, parseSurahParam, route } from "@/server/http";
import { getQuranProvider } from "@/server/quran/provider";

export const runtime = "nodejs";

export const GET = route<{ params: Promise<{ n: string }> }>(async (_req, { params }) => {
  const n = parseSurahParam((await params).n);
  const text = await getQuranProvider().getSurah(n);
  // Quran text is immutable; let browsers/CDNs cache it (the SW can too, for offline).
  return json(text, { headers: { "cache-control": "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400" } });
});
