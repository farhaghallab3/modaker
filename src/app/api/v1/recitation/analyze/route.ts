/**
 * POST /api/v1/recitation/analyze  { range, transcript } → RecitationAnalysis
 *
 * The server loads the expected ayahs from the verified Quran provider —
 * client-supplied verse text is never accepted. Text matching only (no tajweed).
 */
import { analyzeRecitation } from "@/lib/recitation/compare";
import { optionalSession } from "@/server/auth";
import { apiError } from "@/server/errors";
import { enforceRateLimit, json, readJson, route } from "@/server/http";
import { getQuranProvider } from "@/server/quran/provider";
import { toDbEnum } from "@/server/user/mappers";
import { MAX_RECITATION_AYAHS, ayahRangeSchema, transcriptSchema } from "@/server/validation";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({ range: ayahRangeSchema, transcript: transcriptSchema });

export const POST = route(async (req) => {
  const session = await optionalSession(req);
  enforceRateLimit(req, "analyze", session?.userId);
  const { range, transcript } = await readJson(req, bodySchema, 1024 * 1024);
  if (range.to - range.from + 1 > MAX_RECITATION_AYAHS) throw apiError(400, "range_too_large");

  const ayahs = await getQuranProvider().getAyahs(range);
  const analysis = analyzeRecitation(ayahs, transcript, range);

  if (session) {
    // Best-effort history for signed-in users (scores and mistakes only; no audio, no transcript).
    try {
      const { getPrisma } = await import("@/server/db");
      const prisma = await getPrisma();
      await prisma.recitationSession.create({
        data: {
          userId: session.userId,
          surah: range.surah,
          fromAyah: range.from,
          toAyah: range.to,
          provider: transcript.provider.slice(0, 64),
          durationSec: transcript.durationSec ?? null,
          accuracy: analysis.accuracy,
          results: {
            create: analysis.ayahs.map((a) => ({ ayahKey: a.key, ayah: a.ayah, accuracy: a.accuracy, status: toDbEnum(a.status) as never })),
          },
          mistakes: {
            create: analysis.mistakes.slice(0, 500).map((m) => ({
              type: m.type,
              ayahKey: m.ayahKey,
              wordIndex: m.wordIndex ?? null,
              expected: m.expected ?? null,
              heard: m.heard?.slice(0, 100) ?? null,
              pauseSec: m.pauseSec ?? null,
            })),
          },
        },
      });
    } catch (e) {
      console.warn("[recitation] could not save history:", (e as Error).message);
    }
  }

  return json(analysis);
});
