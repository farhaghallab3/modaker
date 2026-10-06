/**
 * POST /api/v1/coach  { facts }  →  { source: "ai" | "template", message: string | null, primary, secondary }
 * The facts are computed on the device from the learner's persisted state (src/lib/coach/facts.ts) and contain
 * only counts, surah names, ayah numbers and ranges — no Quran text, names, e-mails or audio. The model writes a
 * short Arabic message and chooses among the computed actions; its answer is validated against the facts and
 * replaced by the deterministic template (message: null) on any failure. Never exposes technical errors.
 */
import { optionalSession } from "@/server/auth";
import { generateCoach } from "@/server/coach/generate";
import { enforceRateLimit, json, readJson, route } from "@/server/http";
import { coachInputSchema } from "@/server/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = route(async (req) => {
  const session = await optionalSession(req);
  enforceRateLimit(req, "coach", session?.userId);
  const { facts } = await readJson(req, coachInputSchema, 16 * 1024);
  return json(await generateCoach(facts));
});
