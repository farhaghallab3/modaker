/**
 * DEV ONLY — local clip store for the OFFLINE CTC feasibility test.
 * Returns 404 unless STT_BENCHMARK=on, the request is local, AND CTC_CLIPS_DIR is set.
 * Writes 16 kHz mono WAV + a manifest line to that local directory (outside the repo, user-controlled,
 * deletable). Nothing is sent to any model or service, nothing touches learner data.
 *   GET  → list manifest
 *   POST multipart: audio (wav), category, spoken, [surah, from, to] → saves a clip
 */
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { getQuranProvider } from "@/server/quran/provider";

export const runtime = "nodejs";

const CATEGORIES = ["correct", "substitution", "stop-halfway", "omission", "repetition", "non-quran", "silence", "noise"] as const;

function dir(): string | null {
  return process.env.CTC_CLIPS_DIR?.trim() || null;
}
function allowed(req: Request): boolean {
  if (!env.sttBenchmark() || !dir()) return false;
  const host = (req.headers.get("host") ?? "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
const notFound = () => new NextResponse(null, { status: 404 });

export async function GET(req: Request) {
  if (!allowed(req)) return notFound();
  try {
    const text = await readFile(path.join(dir()!, "manifest.jsonl"), "utf8");
    return NextResponse.json({ clips: text.split("\n").filter(Boolean).map((l) => JSON.parse(l)) });
  } catch {
    return NextResponse.json({ clips: [] });
  }
}

export async function POST(req: Request) {
  if (!allowed(req)) return notFound();
  const form = await req.formData();
  const audio = form.get("audio");
  if (!audio || typeof audio === "string" || audio.size < 44 || audio.size > 10 * 1024 * 1024) return NextResponse.json({ error: "bad audio" }, { status: 400 });
  const category = String(form.get("category") ?? "");
  if (!(CATEGORIES as readonly string[]).includes(category)) return NextResponse.json({ error: "bad category" }, { status: 400 });
  const spoken = String(form.get("spoken") ?? "").trim().slice(0, 400);
  if (!spoken && category !== "silence" && category !== "noise") return NextResponse.json({ error: "spoken text required" }, { status: 400 });

  let range: { surah: number; from: number; to: number } | null = null;
  let canonical: string | null = null;
  if (form.get("surah")) {
    const surah = Number(form.get("surah"));
    const from = Number(form.get("from"));
    const to = Number(form.get("to"));
    if (![surah, from, to].every(Number.isInteger) || to < from || to - from > 6) return NextResponse.json({ error: "bad range" }, { status: 400 });
    range = { surah, from, to };
    canonical = (await getQuranProvider().getAyahs(range)).map((a) => a.textUthmani).join(" ");
  }

  const root = dir()!;
  await mkdir(path.join(root, "clips"), { recursive: true });
  const id = `${Date.now().toString(36)}-${category}`;
  const file = `clips/${id}.wav`;
  await writeFile(path.join(root, file), Buffer.from(await audio.arrayBuffer()));
  const entry = { id, file, category, spoken, range, canonical, createdAt: new Date().toISOString() };
  await appendFile(path.join(root, "manifest.jsonl"), JSON.stringify(entry) + "\n", "utf8");
  return NextResponse.json({ ok: true, entry });
}
