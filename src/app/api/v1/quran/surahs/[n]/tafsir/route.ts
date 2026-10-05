/**
 * GET /api/v1/quran/surahs/{n}/tafsir?source=muyassar|ibn-kathir
 *   → { entries: TafsirEntry[], source: SourceRef }
 * Tafsir comes only from approved sources (src/server/rag/sources.ts).
 */
import { z } from "zod";
import { apiError } from "@/server/errors";
import { json, parseSurahParam, route } from "@/server/http";
import { getQuranProvider } from "@/server/quran/provider";
import { tafsirSourceRef } from "@/server/rag/sources";

export const runtime = "nodejs";

const sourceSchema = z.enum(["muyassar", "ibn-kathir"]).default("muyassar");

export const GET = route<{ params: Promise<{ n: string }> }>(async (req, { params }) => {
  const n = parseSurahParam((await params).n);
  const parsed = sourceSchema.safeParse(new URL(req.url).searchParams.get("source") ?? undefined);
  if (!parsed.success) throw apiError(400, "invalid_request", "مصدر التفسير غير معروف. المتاح: muyassar أو ibn-kathir.");
  const entries = await getQuranProvider().getTafsir(n, parsed.data);
  return json(
    { entries, source: tafsirSourceRef(parsed.data) },
    { headers: { "cache-control": "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400" } },
  );
});
