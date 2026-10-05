/**
 * A second, independent opinion.
 *
 * Runs two recognizers on the same audio. The PRIMARY transcript is returned unchanged (it is what the
 * user said, per that recognizer, with its timings); the second transcript is attached as evidence.
 * Downstream, a word the two recognizers hear differently is "uncertain" — it is not counted against the
 * learner — and a word both hear the same (wrong) way is a firmer signal of a real difference.
 *
 * The second opinion is best-effort: if it fails, the primary result is returned with no second opinion.
 */
import type { Transcript } from "@/lib/types";
import type { SpeechToTextProvider, TranscribeInput } from "./provider";

export class ConsensusSttProvider implements SpeechToTextProvider {
  readonly id: string;

  constructor(
    private primary: SpeechToTextProvider,
    private secondary: SpeechToTextProvider,
  ) {
    this.id = `${primary.id}+${secondary.id}`;
  }

  async transcribe(input: TranscribeInput): Promise<Transcript> {
    const [first, second] = await Promise.allSettled([this.primary.transcribe(input), this.secondary.transcribe(input)]);
    if (first.status === "rejected") throw first.reason;
    const t = first.value;
    if (second.status === "rejected") {
      console.warn(`[stt] second opinion (${this.secondary.id}) unavailable:`, (second.reason as Error)?.message);
      return t;
    }
    const s = second.value;
    return {
      ...t,
      evidence: {
        kind: t.evidence?.kind ?? "none",
        lowConfidenceSegments: t.evidence?.lowConfidenceSegments,
        secondOpinion: { provider: s.provider, text: s.text, words: s.words },
      },
    };
  }
}
