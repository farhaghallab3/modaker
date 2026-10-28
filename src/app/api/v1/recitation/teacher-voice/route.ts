/**
 * GET /api/v1/recitation/teacher-voice → signed payloads for the teacher's FIXED feedback sentences, so the browser can prepare
 * their audio while the learner recites and play it the moment the result arrives. Returns { phrases: null } when speech is off.
 * The sentences are constants (src/lib/recitation/coach-feedback.ts): no Quran words, nothing from the user.
 */
import { TEACHER_PHRASES, type TeacherPhraseKey } from "@/lib/recitation/coach-feedback";
import { route } from "@/server/http";
import { speechForText, type SpeechPayload } from "@/server/tts/speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const phrases: Partial<Record<TeacherPhraseKey, SpeechPayload>> = {};
  for (const [key, text] of Object.entries(TEACHER_PHRASES) as [TeacherPhraseKey, string][]) {
    const p = speechForText(text);
    if (!p) return Response.json({ phrases: null }, { headers: { "cache-control": "no-store" } });
    phrases[key] = p;
  }
  return Response.json({ phrases }, { headers: { "cache-control": "no-store" } });
});
