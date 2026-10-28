/**
 * GET /api/v1/status → which voice services this deployment can use (yes/no only; never keys or values).
 * Lets the team check a Vercel setup from the browser: open /api/v1/status after a redeploy.
 */
import { env } from "@/server/env";
import { route } from "@/server/http";
import { sttConfigured } from "@/server/stt/provider";
import { ttsEngine } from "@/server/tts/speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const sttProvider = env.sttProvider();
  const known = ["openai", "groq", "mock"].includes(sttProvider);
  const body = {
    recitation: {
      provider: known ? sttProvider : "unknown",
      ready: sttConfigured(),
      keys: { groq: Boolean(env.groqApiKey()), openai: Boolean(env.openaiApiKey()) },
    },
    speech: {
      enabled: env.assistantTts(),
      engine: ttsEngine(),
      sessionSecret: Boolean(env.sessionSecret()),
      keys: { gemini: Boolean(env.geminiApiKey()), openai: Boolean(env.openaiApiKey()) },
    },
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
});
