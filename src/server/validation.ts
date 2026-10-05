/** Shared zod schemas for API input. */
import { z } from "zod";
import { getSurahMeta } from "@/lib/quran/surahs";

export const MAX_RECITATION_AYAHS = 30;

export const ayahRangeSchema = z
  .object({
    surah: z.number().int().min(1).max(114),
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  })
  .refine((r) => r.to >= r.from && r.to <= (getSurahMeta(r.surah)?.ayahCount ?? 0), { message: "invalid range" });

const wordSchema = z.object({
  text: z.string().max(100),
  start: z.number().min(0).max(36_000).optional(),
  end: z.number().min(0).max(36_000).optional(),
  /** the recognizer's own probability for this word, when it provided one */
  confidence: z.number().min(0).max(1).optional(),
});

export const transcriptSchema = z.object({
  text: z.string().max(20_000),
  words: z.array(wordSchema).max(5_000).optional(),
  provider: z.string().max(64),
  language: z.string().max(16),
  durationSec: z.number().min(0).max(36_000).optional(),
  /** Confidence evidence from the recognizer(s) — carried through so scoring can use it (never stripped). */
  evidence: z
    .object({
      kind: z.enum(["word-logprobs", "segment-logprobs", "none"]),
      lowConfidenceSegments: z
        .array(
          z.object({
            start: z.number(),
            end: z.number(),
            avgLogprob: z.number(),
            noSpeechProb: z.number(),
            compressionRatio: z.number(),
          }),
        )
        .max(500)
        .optional(),
      secondOpinion: z
        .object({ provider: z.string().max(64), text: z.string().max(20_000), words: z.array(wordSchema).max(5_000).optional() })
        .optional(),
    })
    .optional(),
});

export const askSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  context: z
    .object({
      surah: z.number().int().min(1).max(114).optional(),
      ayah: z.number().int().min(1).max(286).optional(),
      storySlug: z.string().max(80).regex(/^[a-z0-9-]+$/).optional(),
    })
    .optional(),
});
