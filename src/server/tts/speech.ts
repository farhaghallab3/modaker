/**
 * Spoken assistant answers (text-to-speech OUTPUT only). Completely separate from Quran recitation, STT and scoring.
 *
 *  - What may be spoken: only the assistant's own GENERATED explanation text, picked server-side from the typed blocks.
 *    Quran verses, hadith evidence, source quotations, templates and Level C (sensitive) answers are never spoken.
 *  - The endpoint is not a generic TTS proxy: the server signs the exact text it is willing to speak (HMAC, short expiry);
 *    the browser can only ask to speak text that came from a real assistant answer.
 *  - Server-side OpenAI call only; audio is streamed back ephemerally and never stored.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeArabic } from "@/lib/quran/normalize";
import type { AssistantAnswer, AnswerBlock } from "@/lib/types";
import { env } from "../env";

export const SPEECH_MAX_CHARS = 1200;
export const SPEECH_MIN_CHARS = 12;
export const SPEECH_TOKEN_TTL_MS = 30 * 60_000;

export interface SpeechPayload {
  text: string;
  /** unix ms */
  exp: number;
  sig: string;
}

// ── what may be spoken ───────────────────────────────────────────────────

/** Cuts to the limit at a sentence end (or a word boundary), never mid-word. */
export function truncateForSpeech(text: string, max = SPEECH_MAX_CHARS): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf("."), head.lastIndexOf("؟"), head.lastIndexOf("!"), head.lastIndexOf("؛"), head.lastIndexOf("\n"));
  if (sentenceEnd >= max * 0.5) return head.slice(0, sentenceEnd + 1).trim();
  const space = head.lastIndexOf(" ");
  return (space > 0 ? head.slice(0, space) : head).trim();
}

const norm = (s: string) => normalizeArabic(s);

/**
 * The safe, speakable text of an answer, or null (no speaker button). Only generated explanations; citation markers and links are removed;
 * an explanation that contains an attached Quran verse verbatim is never read.
 */
export function speakableText(answer: Pick<AssistantAnswer, "blocks" | "verses" | "safetyLevel" | "abstained" | "kind">): string | null {
  if (answer.abstained || answer.safetyLevel === "C" || answer.safetyLevel === "D") return null;
  const blocks: AnswerBlock[] = answer.blocks ?? [];
  const parts = blocks.filter((b): b is Extract<AnswerBlock, { type: "explanation" }> => b.type === "explanation" && b.origin === "generated").map((b) => b.text);
  if (!parts.length) return null; // e.g. a verbatim hadith only, a verse list, a template
  const cleaned = parts
    .join("\n")
    .replace(/\[\d+\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
  if (cleaned.length < SPEECH_MIN_CHARS) return null;
  // never read an explanation that quotes a Quran verse verbatim (that would be a synthetic "recitation")
  const verses = [...(answer.verses ?? []).map((v) => v.textUthmani), ...blocks.flatMap((b) => (b.type === "quran" ? b.verses.map((v) => v.textUthmani) : []))];
  const n = ` ${norm(cleaned)} `;
  for (const v of verses) {
    const nv = norm(v);
    if (nv.split(" ").length >= 3 && n.includes(` ${nv} `)) return null;
  }
  return truncateForSpeech(cleaned);
}

// ── signing ──────────────────────────────────────────────────────────────

function mac(text: string, exp: number, key: string): string {
  return createHmac("sha256", `tts:v1:${key}`).update(`${exp}.${text}`).digest("base64url");
}

export function signSpeech(text: string, key: string, now = Date.now()): SpeechPayload {
  const exp = now + SPEECH_TOKEN_TTL_MS;
  return { text, exp, sig: mac(text, exp, key) };
}

export function verifySpeech(p: SpeechPayload, key: string, now = Date.now()): boolean {
  if (!key || typeof p.text !== "string" || p.text.length < SPEECH_MIN_CHARS || p.text.length > SPEECH_MAX_CHARS) return false;
  if (!Number.isFinite(p.exp) || p.exp < now || p.exp > now + SPEECH_TOKEN_TTL_MS + 5_000) return false;
  const a = Buffer.from(mac(p.text, p.exp, key));
  const b = Buffer.from(String(p.sig));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The payload to attach to an answer, or null when speech is off/unconfigured or nothing is speakable. */
export function speechFor(answer: AssistantAnswer, now = Date.now()): SpeechPayload | null {
  if (!env.assistantTts() || !env.openaiApiKey()) return null;
  const key = env.sessionSecret();
  if (!key) return null;
  const text = speakableText(answer);
  return text ? signSpeech(text, key, now) : null;
}

// ── cost protection (per server instance) ────────────────────────────────

const day = { key: "", n: 0 };
export function takeSpeechBudget(cap: number, now = Date.now()): boolean {
  const key = new Date(now).toISOString().slice(0, 10);
  if (day.key !== key) Object.assign(day, { key, n: 0 });
  if (day.n >= Math.max(1, cap)) return false;
  day.n++;
  return true;
}
export function resetSpeechBudgetForTests() {
  Object.assign(day, { key: "", n: 0 });
}

// ── OpenAI text-to-speech ────────────────────────────────────────────────

const INSTRUCTIONS =
  "تحدّث بالعربية الفصحى الواضحة بنبرة هادئة ودافئة ومتزنة، بإيقاع متوسط، دون مبالغة مسرحية أو تمثيل، كمعلّم لطيف يشرح لطالب علم. انطق الأسماء بوضوح.";

export interface SynthOptions {
  apiKey?: string;
  model?: string;
  voice?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Returns MP3 bytes. Throws on any failure (the route turns it into a generic 502; the written answer is untouched). Never logs text or keys. */
export async function synthesize(text: string, o: SynthOptions = {}): Promise<ArrayBuffer> {
  const model = o.model ?? env.ttsModel();
  const body: Record<string, unknown> = { model, voice: o.voice ?? env.ttsVoice(), input: text, response_format: "mp3" };
  if (model.startsWith("gpt-4o")) body.instructions = INSTRUCTIONS; // tts-1 models do not take instructions
  const res = await (o.fetchImpl ?? fetch)(`${o.baseUrl ?? env.openaiBaseUrl()}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${o.apiKey ?? env.openaiApiKey()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(o.timeoutMs ?? 25_000),
  });
  if (!res.ok) throw new Error(`speech provider HTTP ${res.status}`);
  const audio = await res.arrayBuffer();
  if (audio.byteLength < 100) throw new Error("speech provider returned no audio");
  return audio;
}
