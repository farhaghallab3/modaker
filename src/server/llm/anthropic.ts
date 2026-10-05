/** Anthropic Messages API (server-side only; key never reaches the browser). */
import { env } from "../env";
import { ProviderError } from "../errors";
import type { CompletionRequest, LLMProvider } from "./provider";

interface MessagesResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly id: string;

  constructor(
    private apiKey = env.anthropicApiKey(),
    private model = env.anthropicModel(),
  ) {
    this.id = `anthropic:${model}`;
  }

  async complete(req: CompletionRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens ?? 700,
          temperature: req.temperature ?? 0.2,
          system: req.system,
          messages: req.messages,
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e) {
      throw new ProviderError(this.id, "network error", undefined, { cause: e });
    }
    if (!res.ok) throw new ProviderError(this.id, `HTTP ${res.status}`, res.status);
    const data = (await res.json()) as MessagesResponse;
    return (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n")
      .trim();
  }
}
