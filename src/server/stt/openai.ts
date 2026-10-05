/**
 * OpenAI transcription (POST /v1/audio/transcriptions).
 *
 * Word timestamps (`timestamp_granularities[]=word`, needed for hesitation
 * detection) require `response_format=verbose_json`, which only whisper-1
 * supports. For gpt-4o-*-transcribe models we fall back to plain json and
 * return words without timings.
 */
import type { RecognizedWord, Transcript } from "@/lib/types";
import { env } from "../env";
import { ProviderError } from "../errors";
import { baseMime, extensionFor } from "./mime";
import type { SpeechToTextProvider, TranscribeInput } from "./provider";

interface VerboseJson {
  text: string;
  language?: string;
  duration?: number;
  words?: { word: string; start: number; end: number }[];
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
    } else {
      form.append("response_format", "json");
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
    const data = (await res.json()) as VerboseJson;
    const words: RecognizedWord[] | undefined = data.words?.map((w) => ({ text: w.word.trim(), start: w.start, end: w.end }));
    return {
      text: (data.text ?? "").trim(),
      words: words?.filter((w) => w.text),
      provider: this.id,
      language: input.language,
      durationSec: data.duration,
    };
  }
}
