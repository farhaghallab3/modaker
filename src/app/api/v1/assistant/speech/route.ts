/**
 * POST /api/v1/assistant/speech  { text, exp, sig }  →  audio/mpeg
 * Speaks assistant answers aloud. NOT a generic TTS proxy: `text` must carry the signature the server attached to a real assistant
 * answer (see src/server/tts/speech.ts), so only text the assistant itself produced — and judged safe to read — can be spoken.
 * Same access model as /assistant/ask (optional session; rate limited per user or IP), plus a stricter budget and a daily cap.
 * Output TTS only: unrelated to recitation / STT / scoring. Audio is streamed back and never stored.
 */
import { z } from "zod";
import { optionalSession } from "@/server/auth";
import { env } from "@/server/env";
import { apiError } from "@/server/errors";
import { assertSameOrigin, enforceRateLimit, readJson, route } from "@/server/http";
import { SPEECH_MAX_CHARS, synthesize, takeSpeechBudget, verifySpeech } from "@/server/tts/speech";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  text: z.string().min(1).max(SPEECH_MAX_CHARS),
  exp: z.number().int(),
  sig: z.string().min(16).max(128),
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const session = await optionalSession(req);
  enforceRateLimit(req, "speech", session?.userId);
  const body = await readJson(req, schema, 8 * 1024);

  if (!env.assistantTts() || !env.openaiApiKey()) throw apiError(503, "speech_unavailable");
  if (!verifySpeech(body, env.sessionSecret())) throw apiError(403, "forbidden");
  if (!takeSpeechBudget(env.ttsDailyCap())) throw apiError(429, "rate_limited");

  let audio: ArrayBuffer;
  try {
    audio = await synthesize(body.text);
  } catch (e) {
    console.warn("[speech] synthesis failed:", (e as Error).message); // never the text, never the key
    throw apiError(502, "speech_unavailable");
  }
  return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "content-length": String(audio.byteLength) } });
});
