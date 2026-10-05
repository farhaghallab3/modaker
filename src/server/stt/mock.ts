/**
 * Deterministic STT for tests and local development without API keys.
 * Returns the configured text (or empty) regardless of the audio.
 */
import type { Transcript } from "@/lib/types";
import type { SpeechToTextProvider, TranscribeInput } from "./provider";

export class MockSttProvider implements SpeechToTextProvider {
  readonly id = "mock";
  constructor(private text = "") {}

  async transcribe(input: TranscribeInput): Promise<Transcript> {
    const words = this.text
      .split(/\s+/)
      .filter(Boolean)
      .map((text, i) => ({ text, start: i * 0.6, end: i * 0.6 + 0.5 }));
    return {
      text: this.text,
      words,
      provider: this.id,
      language: input.language,
      durationSec: words.length ? words[words.length - 1].end : 0,
    };
  }
}
