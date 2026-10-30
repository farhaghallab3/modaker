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
  clearSpeechCacheForTests,
  resetSpeechBudgetForTests,
  signSpeech,
  speakableText,
  speechFor,
  replySpeechFor,
  voiceReplyText,
  SPEECH_MAX_CHARS,
  geminiAudioData,
  synthesize,
  toWav,
  truncateForSpeech,
  ttsEngine,
  verifySpeech,
} from "../src/server/tts/speech";
import { FakeQuran } from "./_fixtures";

const SECRET = "test-secret-".padEnd(48, "x");
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  for (const k of ["OPENAI_API_KEY", "SESSION_SECRET", "ASSISTANT_TTS", "TTS_MODEL", "TTS_VOICE", "ASSISTANT_TTS_DAILY_CAP", "TTS_PROVIDER", "GEMINI_API_KEY", "GEMINI_TTS_MODEL", "GEMINI_TTS_VOICE"]) saved[k] = process.env[k];
  process.env.OPENAI_API_KEY = "sk-test-key";
  process.env.SESSION_SECRET = SECRET;
  delete process.env.ASSISTANT_TTS;
  delete process.env.TTS_MODEL;
  delete process.env.TTS_VOICE;
  delete process.env.ASSISTANT_TTS_DAILY_CAP;
  delete process.env.TTS_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_TTS_MODEL;
  delete process.env.GEMINI_TTS_VOICE;
  resetSpeechBudgetForTests();
  clearSpeechCacheForTests();
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

test("a voice question gets the whole reply spoken: warm wording, referrals and tafsir quotes, never Quran or hadith", () => {
  const hadith: AnswerBlock = { type: "hadith", text: "نص الحديث", grade: "صحيح", reference: "مرجع", sourceId: "hadeethenc:hadith" };
  const tafsir = (text: string): AnswerBlock => ({ type: "source_quote", text, sourceId: "tafsir:muyassar", ref: "1:1", citation: 1 });
  const a = answer({
    verses: [verse],
    blocks: [
      explanation("بارك الله فيك، سؤال طيّب.", "template"),
      explanation("إليك ما ورد في المصادر المعتمدة:", "extractive"),
      tafsir("معنى الآية أن الله رحيم بعباده ﴿كلمة مقتبسة﴾ ويغفر لهم."),
      hadith,
      { type: "quran", verses: [verse], source: { id: "s", title: "t" } },
    ],
  });
  const t = voiceReplyText(a)!;
  assert.match(t, /بارك الله فيك/);
  assert.match(t, /قال في التفسير الميسر: معنى الآية/);
  assert.ok(!t.includes("نص الحديث") && !t.includes(verse.textUthmani) && !t.includes("كلمة مقتبسة"));
  // a tafsir quote that contains the attached verse verbatim is left out
  assert.ok(!voiceReplyText(answer({ verses: [verse], blocks: [explanation("مقدمة طيبة طويلة.", "template"), tafsir(`قال: ${verse.textUthmani}`)] }))!.includes("قال:"));
  // Level C / D: only the fixed wording (notice, referral), never source quotes
  const c = voiceReplyText(answer({ safetyLevel: "C", blocks: [{ type: "warning", text: "هذه المسألة قد تتضمن خلافًا.", code: "sensitive" }, tafsir("نص تفسير طويل بما يكفي هنا.")] }))!;
  assert.ok(c.includes("خلافًا") && !c.includes("نص تفسير"));
  assert.match(voiceReplyText(answer({ safetyLevel: "D", blocks: [{ type: "referral", text: "تحتاج إلى فتوى من عالم مؤهل.", templateId: "r" }] }))!, /فتوى/);
  // a Quran-only answer has nothing to say; signing works like the speaker button
  assert.equal(voiceReplyText(answer({ blocks: [{ type: "quran", verses: [verse], source: { id: "s", title: "t" } }] })), null);
  assert.equal(verifySpeech(replySpeechFor(a)!, SECRET), true);
  process.env.ASSISTANT_TTS = "off";
  assert.equal(replySpeechFor(a), null);
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

test("rate limit: the 61st request in the window is refused with Retry-After; another client is unaffected", async () => {
  fakeOpenAi();
  const from = (ip: string) => req(payload(), { "x-forwarded-for": ip });
  for (let i = 0; i < 60; i++) assert.equal((await POST(from("10.0.0.1"), undefined)).status, 200, `request ${i + 1}`);
  const blocked = await POST(from("10.0.0.1"), undefined);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await POST(from("10.0.0.2"), undefined)).status, 200);
});

test("daily cap: over the cap → 429 and OpenAI is not called", async () => {
  const calls = fakeOpenAi();
  process.env.ASSISTANT_TTS_DAILY_CAP = "2";
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) statuses.push((await POST(req(payload(`هذا نص صالح للقراءة رقم ${i} في الاختبار.`), { "x-forwarded-for": `10.1.0.${i}` }), undefined)).status);
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

// ── Gemini (free tier) ───────────────────────────────────────────────────

const pcm = () => new Uint8Array(4000).fill(3);
const fakeGemini = (status = 200, reply: unknown = { steps: [{ type: "model_output", content: [{ type: "audio", data: Buffer.from(pcm()).toString("base64") }] }] }) => {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(status === 200 ? reply : {}), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return calls;
};

test("engine choice: auto prefers Gemini when its key is set; forcing an engine without its key turns speech off", () => {
  assert.equal(ttsEngine(), "openai");
  process.env.GEMINI_API_KEY = "gm-test-key";
  assert.equal(ttsEngine(), "gemini");
  process.env.TTS_PROVIDER = "openai";
  assert.equal(ttsEngine(), "openai");
  delete process.env.OPENAI_API_KEY;
  assert.equal(ttsEngine(), null);
  assert.equal(speechFor(answer()), null);
  process.env.TTS_PROVIDER = "gemini";
  assert.equal(ttsEngine(), "gemini");
  assert.ok(speechFor(answer()), "Gemini alone is enough to offer speech");
  delete process.env.GEMINI_API_KEY;
  assert.equal(ttsEngine(), null);
});

test("a signed payload is spoken by Gemini: WAV back, key in a header, voice + teacher style sent, text sent verbatim", async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = "gm-test-key";
  const calls = fakeGemini();
  const p = payload();
  const res = await POST(req(p), undefined);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "audio/wav");
  assert.equal(res.headers.get("cache-control"), "no-store");
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.equal(bytes.byteLength, 4000 + 44);
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "RIFF");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/interactions$/);
  assert.ok(!calls[0].url.includes("gm-test-key"), "the key never goes in the URL");
  assert.equal(calls[0].headers["x-goog-api-key"], "gm-test-key");
  const body = calls[0].body as any;
  assert.equal(body.model, "gemini-3.8-flash-tts");
  assert.deepEqual(body.generation_config.speech_config, [{ voice: "Sulafat" }]);
  assert.equal(body.input[0].content[0].text, p.text);
  assert.match(body.input[0].content[0].annotations[0].style, /teacher/);
});

test("Gemini failures are a generic 502 with no key in the reply; a reply without audio is an error", async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = "gm-test-key";
  fakeGemini(429);
  const res = await POST(req(payload()), undefined);
  assert.equal(res.status, 502);
  assert.ok(!JSON.stringify(await res.json()).includes("gm-test-key"));
  fakeGemini(200, { steps: [{ type: "model_output", content: [{ type: "text", text: "no audio" }] }] });
  assert.equal((await POST(req(payload()), undefined)).status, 502);
});

test("geminiAudioData reads the last audio block (Interactions API) and the older generateContent shape", () => {
  assert.equal(geminiAudioData({ steps: [{ type: "model_output", content: [{ type: "audio", data: "QQ==" }, { type: "audio", data: "Qg==" }] }] }), "Qg==");
  assert.equal(geminiAudioData({ steps: [{ type: "user_input", content: [{ type: "audio", data: "QQ==" }] }] }), null);
  assert.equal(geminiAudioData({ candidates: [{ content: { parts: [{ inlineData: { data: "Qw==" } }] } }] }), "Qw==");
  assert.equal(geminiAudioData({}), null);
});

test("toWav adds a 24 kHz mono 16-bit header to raw PCM and leaves WAV untouched", () => {
  const wav = toWav(new Uint8Array(10));
  const v = new DataView(wav.buffer);
  assert.equal(wav.length, 54);
  assert.equal(v.getUint32(24, true), 24000);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 10);
  assert.equal(toWav(wav), wav);
});

test("env values pasted with quotes, spaces or a newline still work; GET /status reports yes/no only, never a key", async () => {
  const { cleanEnvValue } = await import("../src/server/env");
  assert.equal(cleanEnvValue(' "groq"\n'), "groq");
  assert.equal(cleanEnvValue("'gm-key'"), "gm-key");
  assert.equal(cleanEnvValue(undefined), "");
  const savedStt = { p: process.env.STT_PROVIDER, k: process.env.GROQ_API_KEY };
  try {
    process.env.STT_PROVIDER = '"Groq" ';
    process.env.GROQ_API_KEY = " gsk-secret-value\n";
    process.env.GEMINI_API_KEY = '"gm-secret-value"';
    const { GET } = await import("../src/app/api/v1/status/route");
    const res = await GET(new Request("https://modaker.test/api/v1/status"), undefined);
    const text = await res.text();
    const j = JSON.parse(text);
    assert.equal(j.recitation.provider, "groq");
    assert.equal(j.recitation.ready, true);
    assert.equal(j.speech.engine, "gemini");
    assert.ok(!text.includes("secret-value"));
  } finally {
    for (const [k, v] of [["STT_PROVIDER", savedStt.p], ["GROQ_API_KEY", savedStt.k]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("the same text is synthesized once per server instance, then served from memory", async () => {
  const calls = fakeOpenAi();
  const p = payload();
  assert.equal((await POST(req(p), undefined)).status, 200);
  assert.equal((await POST(req(p), undefined)).status, 200);
  assert.equal(calls.length, 1);
  // a cached text costs nothing, so it still plays after the daily cap is reached
  process.env.ASSISTANT_TTS_DAILY_CAP = "1";
  assert.equal((await POST(req(p), undefined)).status, 200);
});

test("GET /recitation/teacher-voice signs every fixed teacher sentence, or returns null when speech is off", async () => {
  const { GET } = await import("../src/app/api/v1/recitation/teacher-voice/route");
  const { TEACHER_PHRASES } = await import("../src/lib/recitation/coach-feedback");
  const j = await (await GET(new Request("https://modaker.test/api/v1/recitation/teacher-voice"), undefined)).json();
  assert.deepEqual(Object.keys(j.phrases).sort(), Object.keys(TEACHER_PHRASES).sort());
  for (const [k, v] of Object.entries(j.phrases) as [keyof typeof TEACHER_PHRASES, { text: string; exp: number; sig: string }][]) {
    assert.equal(v.text, TEACHER_PHRASES[k]);
    assert.ok(verifySpeech(v, SECRET));
  }
  process.env.ASSISTANT_TTS = "off";
  const off = await (await GET(new Request("https://modaker.test/api/v1/recitation/teacher-voice"), undefined)).json();
  assert.equal(off.phrases, null);
});
