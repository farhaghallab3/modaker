/**
 * Spoken assistant answers (TTS output only). What may be read, the signed-text design (no generic TTS proxy), limits, failure behaviour.
 * No network: OpenAI is faked. Synthetic text only — no Quran text.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/v1/assistant/speech/route";
import type { AssistantAnswer, AnswerBlock, Ayah } from "../src/lib/types";
import { createAssistant } from "../src/server/rag/assistant";
import { TafsirRetriever } from "../src/server/rag/retriever";
import { HadeethEncProvider } from "../src/server/hadith/hadeethenc";
import { rateLimiter } from "../src/server/rate-limit";
import {
  resetSpeechBudgetForTests,
  signSpeech,
  speakableText,
  speechFor,
  SPEECH_MAX_CHARS,
  synthesize,
  truncateForSpeech,
  verifySpeech,
} from "../src/server/tts/speech";
import { FakeQuran } from "./_fixtures";

const SECRET = "test-secret-".padEnd(48, "x");
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  for (const k of ["OPENAI_API_KEY", "SESSION_SECRET", "ASSISTANT_TTS", "TTS_MODEL", "TTS_VOICE", "ASSISTANT_TTS_DAILY_CAP"]) saved[k] = process.env[k];
  process.env.OPENAI_API_KEY = "sk-test-key";
  process.env.SESSION_SECRET = SECRET;
  delete process.env.ASSISTANT_TTS;
  delete process.env.TTS_MODEL;
  delete process.env.TTS_VOICE;
  delete process.env.ASSISTANT_TTS_DAILY_CAP;
  resetSpeechBudgetForTests();
  rateLimiter.reset();
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = realFetch;
});

const explanation = (text: string, origin: "generated" | "template" | "extractive" = "generated"): AnswerBlock => ({ type: "explanation", text, origin, citations: [1] });
const verse: Ayah = { surah: 1, ayah: 1, key: "1:1", textUthmani: "كلمة أولى ثانية ثالثة رابعة خامسة" };
const answer = (over: Partial<AssistantAnswer> = {}): AssistantAnswer => ({
  kind: "grounded",
  text: "x",
  citations: [],
  provider: "p",
  safetyLevel: "B",
  blocks: [explanation("هذا شرح عام مبسّط للمسألة، ويبيّن المعنى بهدوء [1]. ثم يضيف فكرة ثانية واضحة [2].")],
  ...over,
});
const payload = (text = "هذا نص صالح للقراءة بصوت عالٍ في الاختبار.") => signSpeech(text, SECRET);
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://modaker.test/api/v1/assistant/speech", { method: "POST", headers: { "content-type": "application/json", host: "modaker.test", ...headers }, body: JSON.stringify(body) });
const mp3 = () => new Uint8Array(2048).fill(7);
const fakeOpenAi = (status = 200) => {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return status === 200 ? new Response(mp3(), { status, headers: { "content-type": "audio/mpeg" } }) : new Response("{}", { status });
  }) as typeof fetch;
  return calls;
};

// ── what may be spoken ───────────────────────────────────────────────────

test("a normal generated explanation is speakable: markers removed, signed, verifiable", () => {
  const a = answer();
  const text = speakableText(a)!;
  assert.ok(text && !/\[\d+\]/.test(text));
  assert.match(text, /هذا شرح عام مبسّط/);
  const p = speechFor(a)!;
  assert.equal(p.text, text);
  assert.equal(verifySpeech(p, SECRET), true);
});

test("Quran evidence is excluded: attached verses are never in the speech, and an explanation quoting a verse verbatim is not read", () => {
  const withVerses = answer({ verses: [verse], blocks: [explanation("شرح بلا نص آية [1]."), { type: "quran", verses: [verse], source: { id: "s", title: "t" } }] });
  const t = speakableText(withVerses)!;
  assert.ok(!t.includes(verse.textUthmani));
  const quoting = answer({ verses: [verse], blocks: [explanation(`قال النص: ${verse.textUthmani} ثم شرح [1]`)] });
  assert.equal(speakableText(quoting), null);
  // a Quran-text answer carries no generated explanation at all
  assert.equal(speakableText(answer({ kind: "quran-text", verses: [verse], blocks: [{ type: "quran", verses: [verse], source: { id: "s", title: "t" } }] })), null);
});

test("hadith evidence is excluded; a hadith-only answer has no speaker (checked through the real assistant)", async () => {
  const hadith: AnswerBlock = { type: "hadith", text: "نص الحديث", grade: "صحيح", reference: "مرجع", sourceId: "hadeethenc:hadith" };
  assert.equal(speakableText(answer({ blocks: [hadith] })), null);
  assert.equal(speechFor(answer({ blocks: [hadith] })), null);
  // with a generated explanation next to it, ONLY the explanation is read
  const both = speakableText(answer({ blocks: [hadith, explanation("توضيح عام للحديث بلا نصّه [1].")] }))!;
  assert.ok(both.includes("توضيح عام") && !both.includes("نص الحديث"));

  const rec = { id: "1", title: "إنما الأعمال بالنيات", hadeeth: "نص تجريبي: إنما الأعمال بالنيات", grade: "صحيح", reference: "مرجع" };
  const fetchImpl = (async (url: string) => new Response(JSON.stringify(String(url).includes("/search/") ? [{ id: "1", title: rec.title, hadith_text: rec.hadeeth }] : [rec]), { status: 200 })) as unknown as typeof fetch;
  const quran = new FakeQuran();
  const out = await createAssistant({ quran, retriever: new TafsirRetriever(quran, "muyassar"), llm: null, hadith: new HadeethEncProvider({ fetchImpl, ignoreRegistry: true }) }).answer({ question: "ما صحة حديث إنما الأعمال بالنيات؟" });
  assert.ok(out.blocks!.some((b) => b.type === "hadith"));
  assert.equal(speakableText(out), null);
  assert.equal(speechFor(out), null);
});

test("sensitive (C), personal (D), abstentions, templates and extractive quotes are never offered for speech", () => {
  assert.equal(speakableText(answer({ safetyLevel: "C" })), null);
  assert.equal(speakableText(answer({ safetyLevel: "D" })), null);
  assert.equal(speakableText(answer({ abstained: true })), null);
  assert.equal(speakableText(answer({ blocks: [explanation("هذا نص قالب جاهز طويل بما يكفي.", "template")] })), null);
  assert.equal(speakableText(answer({ blocks: [explanation("اقتباس حرفي من المصدر طويل بما يكفي.", "extractive")] })), null);
});

test("no speech when the feature is off or unconfigured (no OpenAI key / no secret / ASSISTANT_TTS=off)", () => {
  process.env.ASSISTANT_TTS = "off";
  assert.equal(speechFor(answer()), null);
  process.env.ASSISTANT_TTS = "on";
  delete process.env.OPENAI_API_KEY;
  assert.equal(speechFor(answer()), null);
  process.env.OPENAI_API_KEY = "sk-test-key";
  delete process.env.SESSION_SECRET;
  assert.equal(speechFor(answer()), null);
});

// ── length limits ────────────────────────────────────────────────────────

test("oversized text is truncated at a sentence boundary (never mid-word) and the endpoint rejects anything over the limit", async () => {
  const long = Array.from({ length: 200 }, (_, i) => `جملة رقم ${i} تشرح فكرة بسيطة.`).join(" ");
  const cut = truncateForSpeech(long);
  assert.ok(cut.length <= SPEECH_MAX_CHARS && cut.endsWith("."));
  const t = speakableText(answer({ blocks: [explanation(long)] }))!;
  assert.ok(t.length <= SPEECH_MAX_CHARS);
  // a client cannot get longer text spoken: schema limit and signature both refuse it
  const tooLong = "ا".repeat(SPEECH_MAX_CHARS + 1);
  assert.equal(verifySpeech(signSpeech(tooLong, SECRET), SECRET), false);
  const calls = fakeOpenAi();
  const res = await POST(req(signSpeech(tooLong, SECRET)), undefined);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

// ── the endpoint: signed text only, same access model as the assistant ───

test("a signed payload is spoken: MP3 back, OpenAI called server-side with the key, model/voice/instructions, nothing stored", async () => {
  const calls = fakeOpenAi();
  const p = payload();
  const res = await POST(req(p), undefined);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal((await res.arrayBuffer()).byteLength, 2048);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/audio\/speech$/);
  assert.equal(calls[0].body.model, "gpt-4o-mini-tts");
  assert.equal(calls[0].body.voice, "marin");
  assert.equal(calls[0].body.input, p.text);
  assert.match(String(calls[0].body.instructions), /الفصحى/);
  assert.equal(calls[0].headers.authorization, "Bearer sk-test-key");
  assert.ok(!JSON.stringify(calls[0].body).includes("sk-test-key"));
});

test("it is not a generic TTS proxy: missing, forged, tampered, expired or unsigned requests are refused and never reach OpenAI", async () => {
  const calls = fakeOpenAi();
  const good = payload();
  const cases: [string, unknown, number][] = [
    ["empty body", {}, 400],
    ["no signature", { text: good.text, exp: good.exp }, 400],
    ["forged signature", { ...good, sig: "A".repeat(good.sig.length) }, 403],
    ["tampered text", { ...good, text: good.text + " زيادة" }, 403],
    ["signed with another secret", signSpeech(good.text, "another-secret".padEnd(40, "y")), 403],
    ["expired", { ...signSpeech(good.text, SECRET, Date.now() - 2 * 3600_000) }, 403],
    ["exp far in the future", { ...good, exp: Date.now() + 99 * 3600_000 }, 403],
    ["too short", signSpeech("قصير", SECRET), 403],
  ];
  for (const [label, body, status] of cases) assert.equal((await POST(req(body), undefined)).status, status, label);
  assert.equal(calls.length, 0);
});

test("cross-site requests are refused (same-origin rule); with no SESSION_SECRET nothing verifies", async () => {
  const calls = fakeOpenAi();
  assert.equal((await POST(req(payload(), { origin: "https://evil.example" }), undefined)).status, 403);
  assert.equal((await POST(req(payload(), { origin: "https://modaker.test" }), undefined)).status, 200);
  delete process.env.SESSION_SECRET;
  assert.equal((await POST(req(payload()), undefined)).status, 403);
  assert.equal(calls.length, 1);
});

test("disabled feature or missing key → 503 with a friendly message", async () => {
  fakeOpenAi();
  process.env.ASSISTANT_TTS = "off";
  const r = await POST(req(payload()), undefined);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /الإجابة المكتوبة/);
});

// ── rate limiting & cost caps ────────────────────────────────────────────

test("rate limit: the 13th request in the window is refused with Retry-After; another client is unaffected", async () => {
  fakeOpenAi();
  const from = (ip: string) => req(payload(), { "x-forwarded-for": ip });
  for (let i = 0; i < 12; i++) assert.equal((await POST(from("10.0.0.1"), undefined)).status, 200, `request ${i + 1}`);
  const blocked = await POST(from("10.0.0.1"), undefined);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await POST(from("10.0.0.2"), undefined)).status, 200);
});

test("daily cap: over the cap → 429 and OpenAI is not called", async () => {
  const calls = fakeOpenAi();
  process.env.ASSISTANT_TTS_DAILY_CAP = "2";
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) statuses.push((await POST(req(payload(), { "x-forwarded-for": `10.1.0.${i}` }), undefined)).status);
  assert.deepEqual(statuses, [200, 200, 429, 429]);
  assert.equal(calls.length, 2);
});

// ── failures leave the written answer alone ──────────────────────────────

test("provider failure → a small friendly 502; the written answer object is untouched", async () => {
  fakeOpenAi(500);
  const a = answer();
  const before = JSON.stringify(a);
  const res = await POST(req(payload()), undefined);
  assert.equal(res.status, 502);
  const j = await res.json();
  assert.equal(j.code, "speech_unavailable");
  assert.match(j.error, /الإجابة المكتوبة كما هي/);
  assert.ok(!JSON.stringify(j).includes("sk-test-key"));
  assert.equal(JSON.stringify(a), before);
  // a thrown network error behaves the same
  globalThis.fetch = (async () => {
    throw new Error("The operation was aborted due to timeout");
  }) as typeof fetch;
  assert.equal((await POST(req(payload()), undefined)).status, 502);
});

test("synthesize: tts-1 models get no instructions; an empty/garbage reply is an error", async () => {
  const calls = fakeOpenAi();
  await synthesize("نص كافٍ للقراءة في الاختبار.", { model: "tts-1", voice: "alloy" });
  assert.equal(calls[0].body.instructions, undefined);
  globalThis.fetch = (async () => new Response(new Uint8Array(10), { status: 200 })) as typeof fetch;
  await assert.rejects(() => synthesize("نص كافٍ للقراءة في الاختبار."), /no audio/);
});
