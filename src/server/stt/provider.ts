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

let cached: SpeechToTextProvider | null = null;

export function getSttProvider(): SpeechToTextProvider {
  if (cached) return cached;
  const id = env.sttProvider();
  switch (id) {
    case "mock":
      cached = new MockSttProvider(process.env.MOCK_STT_TEXT ?? "");
      break;
    case "openai":
      cached = new OpenAiSttProvider();
      break;
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
