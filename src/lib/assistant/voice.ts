import type { Transcript } from "@/lib/types";

/**
 * Whisper writes text for silence/noise («اشتركوا في القناة» is the classic). The recognizer itself flags those
 * segments with a high no-speech probability: when such segments make up most of the audio, there is no question
 * to show the learner — we say we did not hear them instead of presenting a hallucinated sentence.
 */
export function looksLikeNoSpeech(t: Pick<Transcript, "durationSec" | "evidence" | "text">): boolean {
  if (!t.text?.trim()) return true;
  const segs = t.evidence?.lowConfidenceSegments ?? [];
  const noSpeech = segs.filter((s) => s.noSpeechProb > 0.6).reduce((n, s) => n + Math.max(0, s.end - s.start), 0);
  const total = t.durationSec ?? 0;
  return total > 0 ? noSpeech >= total * 0.4 : segs.some((s) => s.noSpeechProb > 0.6);
}
