/** OpenAI chat completions + embeddings (server-side only). */
import { env } from "../env";
import { ProviderError } from "../errors";
import type { CompletionRequest, EmbeddingProvider, LLMProvider } from "./provider";

async function post<T>(provider: string, url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ProviderError(provider, "network error", undefined, { cause: e });
  }
  if (!res.ok) throw new ProviderError(provider, `HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

export class OpenAiChatProvider implements LLMProvider {
  readonly id: string;

  constructor(
    private apiKey = env.openaiApiKey(),
    private model = env.openaiChatModel(),
    private baseUrl = env.openaiBaseUrl(),
  ) {
    this.id = `openai:${model}`;
  }

  async complete(req: CompletionRequest): Promise<string> {
    const data = await post<{ choices?: { message?: { content?: string } }[] }>(
      this.id,
      `${this.baseUrl}/chat/completions`,
      this.apiKey,
      {
        model: this.model,
        max_tokens: req.maxTokens ?? 700,
        temperature: req.temperature ?? 0.2,
        messages: [{ role: "system", content: req.system }, ...req.messages],
      },
      45_000,
    );
    return (data.choices?.[0]?.message?.content ?? "").trim();
  }
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions = 1536;

  constructor(
    private apiKey = env.openaiApiKey(),
    private model = env.openaiEmbeddingModel(),
    private baseUrl = env.openaiBaseUrl(),
  ) {
    this.id = `openai:${model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const data = await post<{ data: { index: number; embedding: number[] }[] }>(
      this.id,
      `${this.baseUrl}/embeddings`,
      this.apiKey,
      { model: this.model, input: texts, dimensions: this.dimensions },
      60_000,
    );
    return [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
