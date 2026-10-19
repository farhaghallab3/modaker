/**
 * Speech-recognition evidence and scoring confidence.
 *
 * The rule under test: a difference between what was recognized and the expected word is the LEARNER'S
 * mistake only when nothing suggests the RECOGNIZER may have misheard. Otherwise it is "uncertain": the
 * learner is asked to repeat and nothing is scored (or scheduled) against them. The transcript always
 * stays what was recognized — it is never replaced by the expected text.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { analyzeRecitation } from "../src/lib/recitation/compare";
import { traceRecitation } from "../src/lib/recitation/trace";
import { declareMemorized, isWeak } from "../src/lib/review/learning";
import { applyRecitation } from "../src/lib/store/reducers";
import { EMPTY_STATE, type UserState } from "../src/lib/store/state";
import type { Ayah, Transcript } from "../src/lib/types";
import { ConsensusSttProvider } from "../src/server/stt/consensus";
import { segmentEvidence, wordsFromLogprobs } from "../src/server/stt/evidence";
import { OpenAiSttProvider } from "../src/server/stt/openai";
import { buildSttPrompt, DOMAIN_PROMPT } from "../src/server/stt/prompt";
import type { SpeechToTextProvider } from "../src/server/stt/provider";
import { transcriptSchema } from "../src/server/validation";
import { matchKey, tokenize } from "../src/lib/quran/normalize";

// An arbitrary ordering of three Quranic words (NOT an ayah).
const EXPECTED = "ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ ٱلرَّحْمَـٰنِ";
const ayah: Ayah = { surah: 1, ayah: 1, key: "1:1", textUthmani: EXPECTED };
const range = { surah: 1, from: 1, to: 1 };
const tr = (text: string, extra: Partial<Transcript> = {}): Transcript => ({ text, provider: "openai:whisper-1", language: "ar", ...extra });
const analyze = (t: Transcript) => analyzeRecitation([ayah], t, range);

// ── evidence extraction (real API shapes) ────────────────────────────────

test("Whisper segments are flagged only when their own decoding statistics cross Whisper's documented thresholds", () => {
  const ev = segmentEvidence([
    { start: 0, end: 2, avg_logprob: -0.3, no_speech_prob: 0.01, compression_ratio: 1.2 }, // fine
    { start: 2, end: 4, avg_logprob: -1.4, no_speech_prob: 0.02, compression_ratio: 1.3 }, // low avg_logprob
    { start: 4, end: 6, avg_logprob: -0.4, no_speech_prob: 0.9, compression_ratio: 1.1 }, // probably not speech
    { start: 6, end: 8, avg_logprob: -0.4, no_speech_prob: 0.01, compression_ratio: 3.0 }, // repetitive/hallucinated
  ]);
  assert.equal(ev.kind, "segment-logprobs");
  assert.deepEqual(ev.lowConfidenceSegments?.map((s) => [s.start, s.end]), [[2, 4], [4, 6], [6, 8]]);
  assert.equal(segmentEvidence(undefined).kind, "none");
  assert.equal(segmentEvidence([]).kind, "none");
});

test("token log-probabilities become per-word confidence (including tokens that split an Arabic letter's bytes)", () => {
  const bytes = [...new TextEncoder().encode("اهدنا الصراط")];
  // split at arbitrary byte boundaries (a token may end mid-UTF-8-character) and give each token a probability
  const cuts = [3, 5, 9, 10, 15, bytes.length];
  const probs = [0.99, 0.9, 0.95, 0.9, 0.2, 0.3];
  const tokens = cuts.map((end, i) => ({ token: "�", logprob: Math.log(probs[i]), bytes: bytes.slice(i === 0 ? 0 : cuts[i - 1], end) }));
  const words = wordsFromLogprobs(tokens);
  assert.deepEqual(words.map((w) => w.text), ["اهدنا", "الصراط"]);
  assert.ok(words[0].confidence! > 0.9, "a word of well-recognized tokens is confident");
  assert.ok(words[1].confidence! < 0.6, "a word whose tokens had low probability is not");
});

// ── the exact request (no secrets) and what is read back ─────────────────

let sent: { url: string; form: FormData }[] = [];
let reply: unknown = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent = [];
  globalThis.fetch = (async (url: string, init?: { body?: FormData }) => {
    sent.push({ url: String(url), form: init!.body as FormData });
    return Response.json(reply);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const audio = new Uint8Array([1, 2, 3, 4]).buffer;
const fields = (f: FormData) => Object.fromEntries([...f.entries()].filter(([k]) => k !== "file").map(([k, v]) => [k, String(v)]));

test("whisper-1: Arabic is explicit, deterministic, with word + segment evidence and only the generic context prompt", async () => {
  reply = {
    text: "اهدنا الطرق المستقيم",
    duration: 4,
    words: [{ word: "اهدنا", start: 0, end: 0.5 }, { word: "الطرق", start: 0.6, end: 1 }, { word: "المستقيم", start: 1.1, end: 1.9 }],
    segments: [{ start: 0, end: 2, avg_logprob: -1.6, no_speech_prob: 0.01, compression_ratio: 1.2 }],
  };
  const p = new OpenAiSttProvider("sk-test-not-a-real-key", "whisper-1", "https://api.example.test/v1");
  const t = await p.transcribe({ audio, mimeType: "audio/webm", language: "ar", prompt: buildSttPrompt("domain") });

  const f = fields(sent[0].form);
  assert.match(sent[0].url, /\/audio\/transcriptions$/);
  assert.equal(f.model, "whisper-1");
  assert.equal(f.language, "ar", "Arabic is requested explicitly");
  assert.equal(f.temperature, "0");
  assert.equal(f.response_format, "verbose_json");
  assert.deepEqual(sent[0].form.getAll("timestamp_granularities[]").map(String), ["word", "segment"]);
  assert.equal(f.prompt, DOMAIN_PROMPT);
  assert.ok(!JSON.stringify(f).includes("sk-test"), "no credential in the request body");

  assert.equal(t.text, "اهدنا الطرق المستقيم", "the transcript is exactly what the recognizer returned");
  assert.equal(t.evidence?.kind, "segment-logprobs");
  assert.equal(t.evidence?.lowConfidenceSegments?.length, 1);
  assert.deepEqual(p.requestParams({ language: "ar", prompt: DOMAIN_PROMPT })["timestamp_granularities[]"], "word,segment");
});

test("gpt-4o-transcribe: asks for token log-probabilities and returns per-word confidence", async () => {
  const tokens = [..."اهدنا الطرق"].map((c) => ({ token: c, logprob: Math.log(c === "ط" ? 0.2 : 0.97), bytes: [...new TextEncoder().encode(c)] }));
  reply = { text: "اهدنا الطرق", logprobs: tokens };
  const p = new OpenAiSttProvider("sk-test-not-a-real-key", "gpt-4o-transcribe", "https://api.example.test/v1");
  const t = await p.transcribe({ audio, mimeType: "audio/webm", language: "ar" });
  const f = fields(sent[0].form);
  assert.equal(f.response_format, "json");
  assert.equal(f["include[]"], "logprobs");
  assert.equal(f.language, "ar");
  assert.equal(t.evidence?.kind, "word-logprobs");
  assert.deepEqual(t.words?.map((w) => w.text), ["اهدنا", "الطرق"]);
  assert.ok(t.words![1].confidence! < t.words![0].confidence!);
});

// ── the prompt can never carry the answer ────────────────────────────────

test("the transcription prompt never contains the expected ayah text, in any mode", () => {
  const expectedKeys = new Set(tokenize(EXPECTED).map(matchKey));
  for (const mode of ["off", "domain", "surah"] as const) {
    const prompt = buildSttPrompt(mode, { surahName: "الفاتحة" });
    const promptKeys = tokenize(prompt ?? "").map(matchKey);
    const leaked = promptKeys.filter((k) => expectedKeys.has(k));
    assert.deepEqual(leaked, [], `${mode}: ${prompt}`);
  }
  assert.equal(buildSttPrompt("off"), undefined);
  assert.equal(buildSttPrompt("surah", { surahName: "الفاتحة" }), `${DOMAIN_PROMPT} سورة الفاتحة.`, "surah mode adds only the NAME");
  assert.ok(!/[ً-ْٰۖ-ۭ]/.test(DOMAIN_PROMPT), "no Quranic annotation marks — it is plain prose about the audio");
});

// ── a second, independent recognizer ─────────────────────────────────────

const fake = (id: string, text: string, fail = false): SpeechToTextProvider => ({
  id,
  async transcribe(): Promise<Transcript> {
    if (fail) throw new Error("down");
    return { text, provider: id, language: "ar" };
  },
});

test("second opinion is attached as evidence; the primary transcript is returned unchanged", async () => {
  const c = new ConsensusSttProvider(fake("openai:whisper-1", "اهدنا الطرق"), fake("openai:gpt-4o-transcribe", "اهدنا الصراط"));
  const t = await c.transcribe({ audio, mimeType: "audio/webm", language: "ar" });
  assert.equal(t.text, "اهدنا الطرق");
  assert.equal(t.provider, "openai:whisper-1");
  assert.deepEqual(t.evidence?.secondOpinion, { provider: "openai:gpt-4o-transcribe", text: "اهدنا الصراط", words: undefined });
});

test("a failing second opinion never breaks the recitation; a failing primary does", async () => {
  const ok = await new ConsensusSttProvider(fake("a", "x"), fake("b", "", true)).transcribe({ audio, mimeType: "audio/webm", language: "ar" });
  assert.equal(ok.text, "x");
  assert.equal(ok.evidence?.secondOpinion, undefined);
  await assert.rejects(new ConsensusSttProvider(fake("a", "", true), fake("b", "y")).transcribe({ audio, mimeType: "audio/webm", language: "ar" }));
});

// ── scoring: learner mistake vs recognition doubt ────────────────────────

test("the reported case: a plausible recognition error is UNCERTAIN, not 'كلمة مختلفة', and is not scored against the learner", () => {
  const a = analyze(tr("الطرق المستقيم الرحمن"));
  const m = a.mistakes.find((x) => x.type === "uncertain")!;
  assert.ok(m, JSON.stringify(a.mistakes));
  assert.equal(m.heard, "الطرق");
  assert.equal(m.reason, "confusable");
  assert.ok(!a.mistakes.some((x) => x.type === "incorrect"));
  assert.equal(a.uncertainWords, 1);
  assert.equal(a.ayahs[0].status, "uncertain");
  assert.equal(a.ayahs[0].accuracy, 1, "the unscored word leaves numerator and denominator — it is not a penalty");
  assert.equal(a.transcript.text, "الطرق المستقيم الرحمن", "the transcript is untouched");
});

test("evidence decides: second recognizer, word probability, unreliable segment, or a firm signal", () => {
  const mk = (extra: Partial<Transcript>, words = "الطرق المستقيم الرحمن") => analyze(tr(words, extra)).mistakes.find((m) => m.expected === "ٱلصِّرَٰطَ");

  // second recognizer heard the EXPECTED word → disagreement → uncertain
  assert.deepEqual(mk({ evidence: { kind: "none", secondOpinion: { provider: "g", text: "الصراط المستقيم الرحمن" } } })?.reason, "recognizers-disagree");
  // both recognizers heard the same different word → firm: counted
  assert.equal(mk({ evidence: { kind: "none", secondOpinion: { provider: "g", text: "الطرق المستقيم الرحمن" } } })?.type, "incorrect");
  // the recognizer's own probability is low → uncertain; confident → counted
  const w = (c: number) => ({ words: [{ text: "الطرق", confidence: c }, { text: "المستقيم", confidence: 0.99 }, { text: "الرحمن", confidence: 0.99 }] });
  assert.deepEqual([mk(w(0.3))?.type, mk(w(0.3))?.reason, mk(w(0.3))?.confidence], ["uncertain", "low-confidence", 0.3]);
  assert.equal(mk(w(0.97))?.type, "incorrect");
  // the word sits in a segment the recognizer flagged as unreliable → uncertain; a different segment → counted
  const timed = (at: number) => ({
    words: [{ text: "الطرق", start: 0.5, end: 1 }, { text: "المستقيم", start: 1.1, end: 1.9 }, { text: "الرحمن", start: 2, end: 2.5 }],
    evidence: { kind: "segment-logprobs" as const, lowConfidenceSegments: [{ start: at, end: at + 1, avgLogprob: -1.5, noSpeechProb: 0.01, compressionRatio: 1.1 }] },
  });
  assert.equal(mk(timed(0.2))?.reason, "low-confidence");
  assert.equal(mk(timed(2))?.reason, "confusable", "outside the flagged segment only the plausibility heuristic applies");
});

test("saying another word of the passage is NOT enough on its own — only independent corroboration confirms a difference", () => {
  const alone = analyze(tr("المستقيم المستقيم الرحمن")); // الصراط replaced by the next word
  const w = alone.mistakes.find((m) => m.expected === "ٱلصِّرَٰطَ");
  assert.equal(w?.type, "uncertain");
  assert.equal(w?.reason, "unconfirmed");
  // a second recognizer heard the same different word → now it stands as the learner's difference
  const both = analyze(tr("المستقيم المستقيم الرحمن", { evidence: { kind: "none", secondOpinion: { provider: "g", text: "المستقيم المستقيم الرحمن" } } }));
  assert.equal(both.mistakes.find((m) => m.expected === "ٱلصِّرَٰطَ")?.type, "incorrect");
});

test("a difference no signal corroborates is uncertain (unconfirmed) even when it is no plausible confusion", () => {
  const a = analyze(tr("الكتاب المستقيم الرحمن"));
  const m = a.mistakes.find((x) => x.expected === "ٱلصِّرَٰطَ");
  assert.equal(m?.type, "uncertain");
  assert.equal(m?.reason, "unconfirmed");
  assert.equal(a.ayahs[0].status, "uncertain");
  assert.equal(a.transcript.text, "الكتاب المستقيم الرحمن", "the transcript is untouched");
});

test("with corroboration a confirmed difference is scored; without it nothing is", () => {
  const second = { evidence: { kind: "none" as const, secondOpinion: { provider: "g", text: "الطرق المستقيم الرحمن" } } };
  // الصراط → الطرق heard the same by both recognizers: a confirmed difference
  const a = analyze(tr("الطرق المستقيم الرحمن", second));
  assert.ok(a.mistakes.some((m) => m.type === "incorrect"));
  assert.equal(a.ayahs[0].status, "needs-review");
  assert.ok(Math.abs(a.ayahs[0].accuracy - 2 / 3) < 1e-9, "2 correct of 3 judged words");
  // the same recitation heard by ONE recognizer only: nothing is attributed to the learner
  const alone = analyze(tr("الطرق المستقيم الرحمن"));
  assert.equal(alone.mistakes.filter((m) => m.type === "incorrect" || m.type === "omitted").length, 0);
  assert.equal(alone.ayahs[0].status, "uncertain");
});

test("a perfect recitation is still mastered, and nothing is uncertain", () => {
  const a = analyze(tr("الصراط المستقيم الرحمن"));
  assert.equal(a.ayahs[0].status, "mastered");
  assert.equal(a.uncertainWords, 0);
  assert.equal(a.textOnly, true, "memorized-word comparison only — never tajweed");
});

// ── what the learning model does with it ─────────────────────────────────

const memorized = (): UserState => ({ ...EMPTY_STATE, progress: { "1:1": declareMemorized(undefined, 1, 1, new Date("2026-10-05T10:00:00Z")) } });

test("an uncertain ayah changes NOTHING in the learning state (no weak, no review, no evidence)", () => {
  const before = memorized();
  const after = applyRecitation(before, analyze(tr("الطرق المستقيم الرحمن")), new Date("2026-10-05T12:00:00Z"), "rec_u");
  assert.deepEqual(after.progress["1:1"], before.progress["1:1"]);
  assert.equal(isWeak(after.progress["1:1"]), false);
  assert.equal(after.recitations[0].uncertain, 1);
  assert.equal(after.recitations[0].needsReview, 0);
  assert.equal(after.activity.at(-1)!.reviewed, 0, "an unjudged ayah is not counted as reviewed");
});

test("a CORROBORATED difference still schedules review, with the evidence attached", () => {
  const t = tr("الكتاب المستقيم الرحمن", { evidence: { kind: "none", secondOpinion: { provider: "g", text: "الكتاب المستقيم الرحمن" } } });
  const after = applyRecitation(memorized(), analyze(t), new Date("2026-10-05T12:00:00Z"), "rec_f");
  assert.equal(isWeak(after.progress["1:1"]), true);
  assert.deepEqual(after.progress["1:1"].recent?.map((e) => e.recId), ["rec_f"]);
});

test("the SAME difference without corroboration changes nothing", () => {
  const before = memorized();
  const after = applyRecitation(before, analyze(tr("الكتاب المستقيم الرحمن")), new Date("2026-10-05T12:00:00Z"), "rec_u2");
  assert.deepEqual(after.progress["1:1"], before.progress["1:1"]);
});

// ── transport & audit ────────────────────────────────────────────────────

test("evidence survives the client round trip into /analyze (the validation schema does not strip it)", () => {
  const sent = tr("الطرق المستقيم الرحمن", {
    words: [{ text: "الطرق", start: 0, end: 1, confidence: 0.4 }],
    evidence: {
      kind: "segment-logprobs",
      lowConfidenceSegments: [{ start: 0, end: 1, avgLogprob: -1.3, noSpeechProb: 0.1, compressionRatio: 1.2 }],
      secondOpinion: { provider: "g", text: "الصراط", words: [{ text: "الصراط", confidence: 0.9 }] },
    },
  });
  assert.deepEqual(transcriptSchema.parse(JSON.parse(JSON.stringify(sent))), sent);
});

test("the trace exposes every stage and keeps the raw transcript untouched", () => {
  const t = traceRecitation([ayah], tr("الطرق المستقيم الرحمن"), range);
  assert.equal(t.raw.text, "الطرق المستقيم الرحمن");
  assert.deepEqual(t.normalized.map((n) => n.key), ["لطرق", "لمستقيم", "لرحمن"]);
  assert.deepEqual(t.canonical.map((c) => c.key), ["لصرط", "لمستقيم", "لرحمن"]);
  assert.equal(t.alignment[0].op, "SUBSTITUTION");
  assert.equal(t.analysis.ayahs[0].status, "uncertain");
});
