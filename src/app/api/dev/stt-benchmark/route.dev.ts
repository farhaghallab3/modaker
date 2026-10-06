/**
 * DEV ONLY — raw STT benchmark. Returns 404 unless STT_BENCHMARK=on AND the request is local.
 *   GET  → which transcription models this key can use
 *   POST multipart: audio, surah, from, to  → raw results per model × prompt variant
 * Never scores, never touches user data, never stores audio, never returns or logs the API key.
 */
import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { getQuranProvider } from "@/server/quran/provider";
import { CANDIDATE_MODELS, listTranscriptionModels, runBenchmark, type PromptVariant } from "@/server/stt/benchmark";
import { ALLOWED_AUDIO_MIME, baseMime } from "@/server/stt/mime";

export const runtime = "nodejs";
export const maxDuration = 120;

function allowed(req: Request): boolean {
  if (!env.sttBenchmark()) return false;
  const host = (req.headers.get("host") ?? "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
const notFound = () => new NextResponse(null, { status: 404 });

export async function GET(req: Request) {
  if (!allowed(req)) return notFound();
  const { available, error } = await listTranscriptionModels();
  return NextResponse.json({ candidates: CANDIDATE_MODELS, available, error });
}

export async function POST(req: Request) {
  if (!allowed(req)) return notFound();
  const form = await req.formData();
  const audio = form.get("audio");
  if (!audio || typeof audio === "string" || audio.size === 0 || audio.size > 15 * 1024 * 1024) return NextResponse.json({ error: "bad audio" }, { status: 400 });
  const mime = baseMime(audio.type || "");
  if (!ALLOWED_AUDIO_MIME.has(mime)) return NextResponse.json({ error: `unsupported type ${mime}` }, { status: 415 });
  const surah = Number(form.get("surah"));
  const from = Number(form.get("from"));
  const to = Number(form.get("to"));
  if (![surah, from, to].every(Number.isInteger) || to < from || to - from > 6) return NextResponse.json({ error: "bad range" }, { status: 400 });

  const spoken = String(form.get("spoken") ?? "").trim();
  if (!spoken || spoken.length > 400) return NextResponse.json({ error: "spoken text required (what was actually said)" }, { status: 400 });
  const withExperimental = form.get("experimental") === "1";

  const ayahs = await getQuranProvider().getAyahs({ surah, from, to });
  const canonical = ayahs.map((a) => a.textUthmani).join(" "); // used ONLY for local comparison, never sent to a model

  const { available } = await listTranscriptionModels();
  const models = available ? CANDIDATE_MODELS.filter((m) => available.includes(m)) : [...CANDIDATE_MODELS];
  // Primary test: UNPROMPTED. The generic-domain prompt is a clearly separate experimental row, only on request.
  const variants: PromptVariant[] = withExperimental ? ["none", "domain"] : ["none"];
  const results = await runBenchmark(await audio.arrayBuffer(), mime, canonical, spoken, models, variants);

  console.info("[stt-bench]", JSON.stringify({ range: { surah, from, to }, spoken, bytes: audio.size, results: results.map((r) => ({ model: r.model, prompt: r.prompt, ms: r.latencyMs, raw: r.raw, literal: r.fidelity?.literal, error: r.error })) }));
  return NextResponse.json({ canonical, bytes: audio.size, mime, models, results });
}
