/**
 * GET /api/v1/quran/surahs/{n}/translation?lang=en
 *   → { entries: TranslationEntry[], source: SourceRef }
 * An approved translation of the meanings, shown verbatim (src/server/quran/translation.ts).
 */
import { z } from "zod";
import { apiError } from "@/server/errors";
import { json, parseSurahParam, route } from "@/server/http";
import { ENGLISH_TRANSLATION_SOURCE_ID, sourceRef } from "@/server/rag/sources";
import { getTranslationProvider } from "@/server/quran/translation";

export const runtime = "nodejs";

const langSchema = z.enum(["en"]).default("en");

export const GET = route<{ params: Promise<{ n: string }> }>(async (req, { params }) => {
  const n = parseSurahParam((await params).n);
  const parsed = langSchema.safeParse(new URL(req.url).searchParams.get("lang") ?? undefined);
  if (!parsed.success) throw apiError(400, "invalid_request", "لغة الترجمة غير متاحة. المتاح: en.");
  const entries = await getTranslationProvider().getSurah(n);
  return json(
    { entries, source: sourceRef(ENGLISH_TRANSLATION_SOURCE_ID) },
    { headers: { "cache-control": "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400" } },
  );
});
