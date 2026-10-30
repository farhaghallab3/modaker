/**
 * Spoken assistant answers (text-to-speech OUTPUT only). Completely separate from Quran recitation, STT and scoring.
 *
 *  - The speaker button (speechFor): only the assistant's own GENERATED explanation text, picked server-side from the typed blocks.
 *    Quran verses, hadith evidence, source quotations, templates and Level C (sensitive) answers are not offered there.
 *  - A question asked by voice is answered by voice (replySpeechFor): the fixed wording and tafsir quotations too, but still never
 *    Quran verses or hadith.
 *  - The endpoint is not a generic TTS proxy: the server signs the exact text it is willing to speak (HMAC, short expiry);
 *    the browser can only ask to speak text that came from a real assistant answer.
 *  - Server-side call only (Gemini TTS, free tier, or OpenAI TTS; see ttsEngine); audio is streamed back ephemerally and never stored.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeArabic } from "@/lib/quran/normalize";
import type { AssistantAnswer, AnswerBlock } from "@/lib/types";
import { env } from "../env";
import { getSource } from "../rag/sources";

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

/**
 * What is spoken back when the question was ASKED BY VOICE: the whole reply, like a teacher answering out loud.
 * Fixed wording (warm openings, referrals, abstentions, notices), generated explanations and, for ordinary (Level B)
 * questions, up to two approved tafsir quotations with their source named. Never spoken: Quran verses (and any part
 * that contains an attached verse verbatim, or text between Quran brackets), hadith, or anything else that is not tafsir.
 */
export function voiceReplyText(answer: Pick<AssistantAnswer, "blocks" | "verses" | "safetyLevel">): string | null {
  const blocks: AnswerBlock[] = answer.blocks ?? [];
  const verses = [...(answer.verses ?? []).map((v) => v.textUthmani), ...blocks.flatMap((b) => (b.type === "quran" ? b.verses.map((v) => v.textUthmani) : []))]
    .map(norm)
    .filter((v) => v.split(" ").length >= 3);
  const quotesVerse = (t: string) => {
    const n = ` ${norm(t)} `;
    return verses.some((v) => n.includes(` ${v} `));
  };
  const parts: string[] = [];
  let quotes = 0;
  for (const b of blocks) {
    let text: string | null = null;
    if (b.type === "explanation") text = b.text;
    else if (b.type === "referral") text = b.text;
    else if (b.type === "warning" && b.code !== "quote_mismatch") text = b.text; // the mismatch notice ends in «the verified text is:» + a verse
    else if (b.type === "source_quote" && answer.safetyLevel === "B" && quotes < 2 && getSource(b.sourceId)?.kind === "tafsir") {
      const body = b.text.replace(/﴿[^﴾]*﴾/g, " ").replace(/\{[^}]*\}/g, " ");
      text = `قال في ${getSource(b.sourceId)?.title ?? "التفسير"}: ${body}`;
      quotes++;
    }
    if (!text) continue;
    const cleaned = text
      .replace(/\[\d+\]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[﴿﴾]/g, "")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (cleaned && !quotesVerse(cleaned) && !parts.includes(cleaned)) parts.push(cleaned);
  }
  const all = parts.join("\n");
  return all.length >= SPEECH_MIN_CHARS ? truncateForSpeech(all) : null;
}

/** The spoken reply to a voice question (see voiceReplyText), signed; null when speech is off/unconfigured. */
export function replySpeechFor(answer: AssistantAnswer, now = Date.now()): SpeechPayload | null {
  if (!env.assistantTts() || !ttsEngine()) return null;
  const key = env.sessionSecret();
  const text = key ? voiceReplyText(answer) : null;
  return text ? signSpeech(text, key, now) : null;
}

/** Signs text the server wrote itself (e.g. recitation feedback sentences), or null when speech is off/unconfigured. */
export function speechForText(text: string, now = Date.now()): SpeechPayload | null {
  if (!env.assistantTts() || !ttsEngine()) return null;
  const key = env.sessionSecret();
  const t = truncateForSpeech(text.trim());
  if (!key || t.length < SPEECH_MIN_CHARS) return null;
  return signSpeech(t, key, now);
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
  if (!env.assistantTts() || !ttsEngine()) return null;
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

// ── engine choice ────────────────────────────────────────────────────────

export type TtsEngine = "gemini" | "openai";

/** The voice engine that will speak, or null when none has a key. "auto" prefers Gemini (free tier) when its key is set. */
export function ttsEngine(): TtsEngine | null {
  const want = env.ttsProvider();
  const gemini = Boolean(env.geminiApiKey());
  const openai = Boolean(env.openaiApiKey());
  if (want === "gemini") return gemini ? "gemini" : null;
  if (want === "openai") return openai ? "openai" : null;
  return gemini ? "gemini" : openai ? "openai" : null;
}

export interface SpeechAudio {
  audio: ArrayBuffer;
  contentType: string;
}

/** Speaks with the configured engine. Throws on any failure (the route turns it into a generic 502). */
/** Recently spoken texts (e.g. the teacher's fixed sentences) are reused instead of asking the voice service again. */
const audioCache = new Map<string, SpeechAudio>();
const AUDIO_CACHE_MAX = 24;
export function clearSpeechCacheForTests() {
  audioCache.clear();
}

const audioCacheKey = (text: string) => `${ttsEngine()}:${env.geminiTtsVoice()}:${env.ttsVoice()}:${text}`;

/** Audio already made for this exact text on this server instance (costs nothing, so it is not counted against the daily cap). */
export function cachedSpeech(text: string): SpeechAudio | null {
  return audioCache.get(audioCacheKey(text)) ?? null;
}

export async function synthesizeSpeech(text: string, o: SynthOptions = {}): Promise<SpeechAudio> {
  const engine = ttsEngine();
  const cacheKey = audioCacheKey(text);
  const hit = audioCache.get(cacheKey);
  if (hit && !o.fetchImpl) return hit;
  const out = await synthesizeUncached(engine, text, o);
  if (!o.fetchImpl) {
    if (audioCache.size >= AUDIO_CACHE_MAX) audioCache.delete(audioCache.keys().next().value as string);
    audioCache.set(cacheKey, out);
  }
  return out;
}

async function synthesizeUncached(engine: TtsEngine | null, text: string, o: SynthOptions): Promise<SpeechAudio> {
  if (engine === "gemini") return { audio: await synthesizeGemini(text, o), contentType: "audio/wav" };
  if (engine === "openai") return { audio: await synthesize(text, o), contentType: "audio/mpeg" };
  throw new Error("no speech engine configured");
}

// ── Gemini text-to-speech (free tier) ────────────────────────────────────

/** Delivery style. Gemini reads `text` word for word, so how to speak goes in this separate field. */
export const GEMINI_STYLE =
  "calm, warm and patient, like a kind teacher explaining to a student; medium pace; clear Modern Standard Arabic; no theatrical acting";

interface GeminiContent {
  type?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
}
interface GeminiReply {
  steps?: { type?: string; content?: GeminiContent[] }[];
  candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
}

/** The base64 audio in a Gemini reply (Interactions API, or the older generateContent shape), or null. */
export function geminiAudioData(reply: GeminiReply): string | null {
  const fromSteps = (reply.steps ?? [])
    .filter((s) => s.type === undefined || s.type === "model_output")
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === "audio" && typeof c.data === "string")
    .map((c) => c.data as string);
  if (fromSteps.length) return fromSteps[fromSteps.length - 1];
  const parts = reply.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.map((p) => p.inlineData?.data).filter((d): d is string => typeof d === "string");
  return inline.length ? inline[inline.length - 1] : null;
}

/** Wraps raw 16-bit mono PCM in a WAV header so every browser can play it. Bytes that already are WAV pass through. */
export function toWav(bytes: Uint8Array, sampleRate = 24_000): Uint8Array {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WAVE") return bytes;
  const out = new Uint8Array(44 + bytes.length);
  const v = new DataView(out.buffer);
  const ascii = (at: number, t: string) => [...t].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + bytes.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  v.setUint32(40, bytes.length, true);
  out.set(bytes, 44);
  return out;
}

/** Returns WAV bytes. Throws on any failure. Never logs text or keys. */
export async function synthesizeGemini(text: string, o: SynthOptions = {}): Promise<ArrayBuffer> {
  const body = {
    model: o.model ?? env.geminiTtsModel(),
    input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: GEMINI_STYLE }] }] }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: o.voice ?? env.geminiTtsVoice() }] },
  };
  const res = await (o.fetchImpl ?? fetch)(`${o.baseUrl ?? env.geminiBaseUrl()}/interactions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey ?? env.geminiApiKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(o.timeoutMs ?? 25_000),
  });
  if (!res.ok) throw new Error(`speech provider HTTP ${res.status}`);
  const data = geminiAudioData((await res.json().catch(() => ({}))) as GeminiReply);
  if (!data) throw new Error("speech provider returned no audio");
  const wav = toWav(new Uint8Array(Buffer.from(data, "base64")));
  if (wav.byteLength < 100 + 44) throw new Error("speech provider returned no audio");
  return wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
}
