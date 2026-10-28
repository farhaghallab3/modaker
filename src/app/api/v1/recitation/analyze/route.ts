/**
 * POST /api/v1/recitation/analyze  { range, transcript } → RecitationAnalysis
 *
 * The server loads the expected ayahs from the verified Quran provider —
 * client-supplied verse text is never accepted. Text matching only (no tajweed).
 */
import { OVERRUN_MIN_WORDS, analyzeRecitationWithOverrun, trailingExtraWords } from "@/lib/recitation/compare";
import { getSurahMeta } from "@/lib/quran/surahs";
import { optionalSession } from "@/server/auth";
import { env } from "@/server/env";
import { apiError } from "@/server/errors";
import { enforceRateLimit, json, readJson, route } from "@/server/http";
import { getQuranProvider } from "@/server/quran/provider";
import { toDbEnum } from "@/server/user/mappers";
import { recitationFeedbackText } from "@/lib/recitation/coach-feedback";
import { speechForText } from "@/server/tts/speech";
import { MAX_RECITATION_AYAHS, ayahRangeSchema, transcriptSchema } from "@/server/validation";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({ range: ayahRangeSchema, transcript: transcriptSchema });

export const POST = route(async (req) => {
  const session = await optionalSession(req);
  enforceRateLimit(req, "analyze", session?.userId);
  const { range, transcript } = await readJson(req, bodySchema, 1024 * 1024);
  if (range.to - range.from + 1 > MAX_RECITATION_AYAHS) throw apiError(400, "range_too_large");

  const provider = getQuranProvider();
  const ayahs = await provider.getAyahs(range);
  // Recited past the end of the range? Load the following ayahs so those words are checked, not set aside.
  const ayahCount = getSurahMeta(range.surah)?.ayahCount ?? range.to;
  const lastAllowed = Math.min(ayahCount, range.from + MAX_RECITATION_AYAHS - 1);
  const following =
    range.to < lastAllowed && trailingExtraWords(ayahs, transcript) >= OVERRUN_MIN_WORDS
      ? await provider.getAyahs({ surah: range.surah, from: range.to + 1, to: lastAllowed })
      : [];
  const analysis = analyzeRecitationWithOverrun(ayahs, following, transcript, range, MAX_RECITATION_AYAHS);
  if (env.sttTrace()) {
    // Developer diagnostics only (STT_TRACE=on): the pipeline stages for this analysis.
    const { traceRecitation } = await import("@/lib/recitation/trace");
    const used = [...ayahs, ...following.filter((a) => a.ayah <= analysis.range.to)];
    const t = traceRecitation(used, transcript, analysis.range);
    console.info("[stt-trace] analyze", JSON.stringify({ normalized: t.normalized, alignment: t.alignment, mistakes: analysis.mistakes, perAyah: analysis.ayahs.map((a) => ({ k: a.key, acc: a.accuracy, status: a.status })) }));
  }

  if (session) {
    // Best-effort history for signed-in users (scores and mistakes only; no audio, no transcript).
    try {
      const { getPrisma } = await import("@/server/db");
      const prisma = await getPrisma();
      await prisma.recitationSession.create({
        data: {
          userId: session.userId,
          surah: range.surah,
          fromAyah: analysis.range.from,
          toAyah: analysis.range.to,
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

  // The teacher's spoken feedback: fixed sentences with ayah numbers only (never Quran words).
  const feedbackText = recitationFeedbackText(analysis);
  return json({ ...analysis, feedbackText, speech: speechForText(feedbackText) ?? undefined });
});
