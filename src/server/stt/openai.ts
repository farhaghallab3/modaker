/**
 * OpenAI transcription (POST /v1/audio/transcriptions).
 *
 * What each model family can tell us (verified against the live API):
 *  - whisper-1  (verbose_json): word timestamps (needed for hesitation detection) and, per SEGMENT,
 *    avg_logprob / no_speech_prob / compression_ratio. NO per-word confidence.
 *  - gpt-4o-transcribe, gpt-4o-mini-transcribe (json + include=logprobs): per-TOKEN log-probabilities,
 *    which we group into per-word confidence. NO word timestamps.
 *
 * The transcript is always what the recognizer returned; it is never altered toward expected text.
 * Evidence (segment statistics / word probabilities) is attached only when the API really returned it.
 */
import type { RecognizedWord, Transcript } from "@/lib/types";
import { env } from "../env";
import { ProviderError } from "../errors";
import { segmentEvidence, wordsFromLogprobs, type TokenLogprob, type WhisperSegment } from "./evidence";
import { baseMime, extensionFor } from "./mime";
import type { SpeechToTextProvider, TranscribeInput } from "./provider";

interface ApiJson {
  text: string;
  language?: string;
  duration?: number;
  words?: { word: string; start: number; end: number }[];
  segments?: WhisperSegment[];
  logprobs?: TokenLogprob[];
}

export class OpenAiSttProvider implements SpeechToTextProvider {
  readonly id: string;

  constructor(
    private apiKey = env.openaiApiKey(),
    private model = env.openaiSttModel(),
    private baseUrl = env.openaiBaseUrl(),
  ) {
    this.id = `openai:${model}`;
  }

  /** The exact request parameters (for auditing; contains no secrets). */
  requestParams(input: Pick<TranscribeInput, "language" | "prompt">): Record<string, string> {
    const verbose = this.model.startsWith("whisper");
    return {
      model: this.model,
      language: input.language,
      temperature: "0",
      ...(input.prompt ? { prompt: input.prompt } : {}),
      response_format: verbose ? "verbose_json" : "json",
      ...(verbose ? { "timestamp_granularities[]": "word,segment" } : { "include[]": "logprobs" }),
    };
  }

  async transcribe(input: TranscribeInput): Promise<Transcript> {
    if (!this.apiKey) throw new ProviderError(this.id, "OPENAI_API_KEY is not set");
    const verbose = this.model.startsWith("whisper");

    const form = new FormData();
    const mime = baseMime(input.mimeType);
    form.append("file", new Blob([input.audio], { type: mime }), `recitation.${extensionFor(mime)}`);
    form.append("model", this.model);
    form.append("language", input.language);
    form.append("temperature", "0");
    if (input.prompt) form.append("prompt", input.prompt);
    if (verbose) {
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.append("timestamp_granularities[]", "segment");
    } else {
      form.append("response_format", "json");
      form.append("include[]", "logprobs");
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      throw new ProviderError(this.id, "network error", undefined, { cause: e });
    }
    if (!res.ok) {
      // Body may echo request details; log status only.
      throw new ProviderError(this.id, `HTTP ${res.status}`, res.status);
    }
    const data = (await res.json()) as ApiJson;

    let words: RecognizedWord[] | undefined = data.words?.map((w) => ({ text: w.word.trim(), start: w.start, end: w.end }));
    let evidence: Transcript["evidence"] = { kind: "none" };
    if (verbose) {
      evidence = segmentEvidence(data.segments);
    } else if (data.logprobs?.length) {
      words = wordsFromLogprobs(data.logprobs);
      evidence = { kind: "word-logprobs" };
    }

    return {
      text: (data.text ?? "").trim(),
      words: words?.filter((w) => w.text),
      provider: this.id,
      language: input.language,
      durationSec: data.duration,
      evidence,
    };
  }
}
