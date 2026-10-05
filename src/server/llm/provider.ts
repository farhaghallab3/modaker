/**
 * LLM + embedding abstractions. Vendor code lives in anthropic.ts / openai.ts.
 * LLM_PROVIDER=extractive → getLlmProvider() returns null and the assistant
 * answers by quoting retrieved passages verbatim (no generation at all).
 */
import { env } from "../env";
import { AnthropicProvider } from "./anthropic";
import { OpenAiChatProvider, OpenAiEmbeddingProvider } from "./openai";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  /** e.g. "anthropic:claude-sonnet-4-5" */
  readonly id: string;
  complete(req: CompletionRequest): Promise<string>;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  /** One vector per input, same order. */
  embed(texts: string[]): Promise<number[][]>;
}

/** Must match `vector(1536)` in prisma/schema.prisma. */
export const EMBEDDING_DIMENSIONS = 1536;

export function getLlmProvider(): LLMProvider | null {
  switch (env.llmProvider()) {
    case "anthropic":
      return env.anthropicApiKey() ? new AnthropicProvider() : null;
    case "openai":
      return env.openaiApiKey() ? new OpenAiChatProvider() : null;
    default:
      return null; // "extractive"
  }
}

export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (env.embeddingProvider() === "openai" && env.openaiApiKey()) return new OpenAiEmbeddingProvider();
  return null;
}
