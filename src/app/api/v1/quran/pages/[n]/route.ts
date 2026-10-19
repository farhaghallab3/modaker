/**
 * GET /api/v1/quran/pages/{n} → MushafPage (1–604): Madinah Mushaf layout with QCF V2 glyphs,
 * verified verse by verse against the configured QuranProvider (src/server/quran/mushaf.ts).
 */
import { isValidPage } from "@/lib/quran/mushaf";
import { apiError } from "@/server/errors";
import { json, route } from "@/server/http";
import { getMushafPage } from "@/server/quran/mushaf";
import { getQuranProvider } from "@/server/quran/provider";

export const runtime = "nodejs";

export const GET = route<{ params: Promise<{ n: string }> }>(async (_req, { params }) => {
  const n = Number((await params).n);
  if (!isValidPage(n)) throw apiError(404, "not_found", "رقم الصفحة غير صحيح (من ١ إلى ٦٠٤).");
  const page = await getMushafPage(n, getQuranProvider());
  return json(page, { headers: { "cache-control": "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400" } });
});
