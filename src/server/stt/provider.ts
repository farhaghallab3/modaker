/**
 * Server-side speech-to-text abstraction (the upload path). The browser Web
 * Speech path never reaches the server. Providers only *transcribe*; scoring
 * happens in src/lib/recitation/compare.ts (text matching — no tajweed).
 *
 * Audio handed to a provider is an in-memory ArrayBuffer; providers must not
 * write it anywhere. Retention (opt-in only) is handled by the route via
 * src/server/recordings/store.ts.
 */
import type { Transcript } from "@/lib/types";
import { env } from "../env";
import { ConsensusSttProvider } from "./consensus";
import { MockSttProvider } from "./mock";
import { OpenAiSttProvider } from "./openai";

export interface TranscribeInput {
  audio: ArrayBuffer;
  mimeType: string;
  language: "ar";
  /** Optional vocabulary hint. Never pass verse text here (keeps STT honest). */
  prompt?: string;
}

export interface SpeechToTextProvider {
  readonly id: string;
  transcribe(input: TranscribeInput): Promise<Transcript>;
}

export { ALLOWED_AUDIO_MIME, baseMime, extensionFor } from "./mime";

/**
 * The PRIMARY recognizer for recitation must not silently correct what the learner said. Measured on real
 * recordings: whisper-1 kept a deliberate wrong word; the GPT-4o transcription family (gpt-4o-transcribe,
 * gpt-4o-mini-transcribe, gpt-transcribe) rewrote it toward the Quran. Any non-Whisper model configured as the
 * primary is therefore ignored for recitation (other models may still serve as a second opinion, i.e. evidence).
 */
export const RECITATION_FALLBACK_MODEL = "whisper-1";
export function recitationPrimaryModel(configured: string): { model: string; overridden: boolean } {
  return /^whisper/.test(configured) ? { model: configured, overridden: false } : { model: RECITATION_FALLBACK_MODEL, overridden: true };
}

let cached: SpeechToTextProvider | null = null;

export function getSttProvider(): SpeechToTextProvider {
  if (cached) return cached;
  const id = env.sttProvider();
  switch (id) {
    case "mock":
      cached = new MockSttProvider(process.env.MOCK_STT_TEXT ?? "");
      break;
    case "openai": {
      const { model, overridden } = recitationPrimaryModel(env.openaiSttModel());
      if (overridden) console.warn(`[stt] OPENAI_STT_MODEL="${env.openaiSttModel()}" can silently correct recitation toward the Quran; using ${model} as the primary recognizer.`);
      const primary = new OpenAiSttProvider(env.openaiApiKey(), model);
      const second = env.sttSecondOpinion();
      // A second recognizer, when configured, gives independent evidence about each disputed word.
      cached = second && second !== "off" && second !== model ? new ConsensusSttProvider(primary, new OpenAiSttProvider(env.openaiApiKey(), second)) : primary;
      break;
    }
    default:
      throw new Error(`Unknown STT_PROVIDER "${id}" (expected openai | mock)`);
  }
  return cached;
}

/** Whether the configured server-side provider can actually run. */
export function sttConfigured(): boolean {
  const id = env.sttProvider();
  return id === "mock" || (id === "openai" && Boolean(env.openaiApiKey()));
}
