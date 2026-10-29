/**
 * POST /api/v1/recitation/teacher  { range, transcript, tajweed?, said? }
 *   → { source: "ai" | "template", segments: ({ say, speech } | { word: { ayah, word } } | { ayah })[] }
 *
 * What «الشيخ المعلّم» says after a recitation: praise, what was read and skipped, each word to fix followed by the
 * word from a human reciter. The word check is redone here from the verified text (the client's verse text is never
 * used); the tajweed notes are re-validated. Each sentence comes signed for /assistant/speech (speech: null when the
 * voice is off). Sentences never contain Quran text (see teacher-script.ts). Nothing is stored.
 */
import { z } from "zod";
import { TEACHER_PHRASES, type TeacherPhraseKey } from "@/lib/recitation/coach-feedback";
import { parseTajweedResult } from "@/lib/recitation/tajweed-notes";
import { buildTeacherFacts, joinSayings, type TeacherSegmentOut } from "@/lib/recitation/teacher-script";
import { optionalSession } from "@/server/auth";
import { apiError } from "@/server/errors";
import { enforceRateLimit, json, readJson, route } from "@/server/http";
import { analyzeOnServer } from "@/server/recitation";
import { writeTeacherScript } from "@/server/teacher";
import { speechForText } from "@/server/tts/speech";
import { MAX_RECITATION_AYAHS, ayahRangeSchema, transcriptSchema } from "@/server/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  range: ayahRangeSchema,
  transcript: transcriptSchema,
  tajweed: z.unknown().optional(),
  said: z.string().max(32).optional(),
});

export const POST = route(async (req) => {
  const session = await optionalSession(req);
  enforceRateLimit(req, "teacher", session?.userId);
  const body = await readJson(req, bodySchema, 1024 * 1024);
  if (body.range.to - body.range.from + 1 > MAX_RECITATION_AYAHS) throw apiError(400, "range_too_large");

  const { analysis, ayahs, following } = await analyzeOnServer(body.range, body.transcript);
  if (analysis.recognition !== "good") return json({ source: "template", segments: [] });
  const tajweed = body.tajweed === undefined ? null : parseTajweedResult(body.tajweed, analysis.range);
  const said = body.said && Object.hasOwn(TEACHER_PHRASES, body.said) ? TEACHER_PHRASES[body.said as TeacherPhraseKey] : "";

  const facts = buildTeacherFacts(analysis, tajweed, said);
  const texts = [...ayahs, ...following].filter((a) => a.ayah >= analysis.range.from && a.ayah <= analysis.range.to).map((a) => a.textUthmani);
  const seed = [...body.transcript.text].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381);
  const { source, segments } = await writeTeacherScript(facts, texts, seed);

  const out: TeacherSegmentOut[] = joinSayings(segments).map((s) => ("say" in s ? { say: s.say, speech: speechForText(s.say) } : s));
  return json({ source, segments: out }, { headers: { "cache-control": "no-store" } });
});
