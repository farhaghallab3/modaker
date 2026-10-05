/**
 * Approximate word timings from Web Speech result segments.
 *
 * The Web Speech API gives no word timestamps. We record, per result, when it
 * was first heard (first interim) and when it became final, then spread its
 * words evenly across that window. Gaps *between* segments — what hesitation
 * detection needs — are therefore preserved reasonably well.
 */
import type { RecognizedWord } from "@/lib/types";

export interface TimedSegment {
  text: string;
  /** seconds since recording start when the segment was first heard */
  start: number;
  /** seconds since recording start when the segment was finalized */
  end: number;
}

/** Engines finalize a little after speech ends; trim that lag from each window. */
const FINALIZE_LAG = 0.35;

export function segmentsToWords(segments: TimedSegment[]): RecognizedWord[] {
  const out: RecognizedWord[] = [];
  for (const s of segments) {
    const words = s.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const start = Math.max(0, s.start);
    const end = Math.max(start + 0.2 * words.length, s.end - FINALIZE_LAG);
    const step = (end - start) / words.length;
    words.forEach((text, i) => {
      out.push({ text, start: round(start + i * step), end: round(start + (i + 1) * step) });
    });
  }
  return out;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
