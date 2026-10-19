/**
 * Conservative Beta policy for recitation checking. Only strong, corroborated evidence may change learning
 * state; weak, unclear or unvalidated recognition produces "uncertain"/"retry"/"practice" and nothing else.
 * The recognizer's transcript is always kept exactly as heard and is never altered by the expected text.
 * (No Quran text is hand-typed here beyond single words; ordinary Arabic sentences are used.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRecitation, isLearningEligible, MIN_MATCHED_SHARE } from "../src/lib/recitation/compare";
import { declareMemorized, isWeak } from "../src/lib/review/learning";
import { applyRecitation } from "../src/lib/store/reducers";
import { EMPTY_STATE, type UserState } from "../src/lib/store/state";
import type { Ayah, Transcript } from "../src/lib/types";

const mk = (n: number, text: string): Ayah => ({ surah: 999, ayah: n, key: `999:${n}`, textUthmani: text });
const AYAHS = [mk(1, "ذَهَبَ ٱلطَّالِبُ إِلَى ٱلْمَدْرَسَةِ صَبَاحًا"), mk(2, "وَقَرَأَ ٱلْكِتَٰبَ فِى ٱلْمَكْتَبَةِ ٱلْكَبِيرَةِ")];
const range = { surah: 999, from: 1, to: 2 };
const tr = (text: string, extra: Partial<Transcript> = {}): Transcript => ({ text, provider: "openai:whisper-1", language: "ar", ...extra });
const FULL = "ذهب الطالب الى المدرسة صباحا وقرأ الكتاب في المكتبة الكبيرة";

const learned = (): UserState => ({
  ...EMPTY_STATE,
  progress: { "999:1": declareMemorized(undefined, 999, 1, new Date("2026-10-05T10:00:00Z")), "999:2": declareMemorized(undefined, 999, 2, new Date("2026-10-05T10:00:00Z")) },
});
const NOW = new Date("2026-10-05T12:00:00Z");

test("a clean recitation from the validated server recognizer counts", () => {
  const a = analyzeRecitation(AYAHS, tr(FULL), range);
  assert.equal(a.recognition, "good");
  assert.equal(a.learningEligible, true);
  assert.ok(a.ayahs.every((x) => x.status === "mastered"));
  assert.equal(a.matchedWords, a.expectedWords);
});

test("only the validated recognizer may change learning state", () => {
  assert.equal(isLearningEligible({ provider: "openai:whisper-1" }), true);
  for (const p of ["browser:web-speech", "dev:simulation", "mock", "openai:gpt-4o-transcribe"]) assert.equal(isLearningEligible({ provider: p }), false, p);
});

test("on-device / unvalidated recognition is practice only: feedback shown, learning state untouched", () => {
  const a = analyzeRecitation(AYAHS, tr(FULL, { provider: "browser:web-speech" }), range);
  assert.equal(a.learningEligible, false);
  const before = learned();
  const after = applyRecitation(before, a, NOW, "rec_p");
  assert.deepEqual(after.progress, before.progress);
  assert.equal(after.recitations[0].practice, true);
  assert.equal(after.activity.at(-1)!.reviewed, 0);
});

test("a hallucinated / unrelated transcript asks the learner to repeat and accuses nobody", () => {
  for (const text of ["اشتركوا في القناة", "taرatыn pa", "شكرا للمشاهدة"]) {
    const a = analyzeRecitation(AYAHS, tr(text), range);
    assert.equal(a.recognition, "poor", text);
    assert.equal(a.learningEligible, false);
    assert.ok(a.ayahs.every((x) => x.status === "uncertain"));
    assert.equal(a.mistakes.filter((m) => m.type === "incorrect" || m.type === "omitted").length, 0);
    assert.equal(a.accuracy, 0);
    const before = learned();
    assert.deepEqual(applyRecitation(before, a, NOW, "r").progress, before.progress);
    assert.equal(a.transcript.text, text, "the transcript is exactly what was recognized");
  }
});

test("an empty transcript is 'empty', not an error by the learner", () => {
  const a = analyzeRecitation(AYAHS, tr(""), range);
  assert.equal(a.recognition, "empty");
  assert.ok(a.ayahs.every((x) => x.status === "uncertain"));
});

test("the poor-recognition threshold is explicit", () => {
  assert.ok(MIN_MATCHED_SHARE > 0 && MIN_MATCHED_SHARE < 0.5);
});

test("stopping early / reciting only part is not an omission accusation", () => {
  const a = analyzeRecitation(AYAHS, tr("ذهب الطالب الى المدرسة صباحا وقرأ الكتاب"), range); // second ayah unfinished
  assert.equal(a.recognition, "good");
  assert.equal(a.ayahs[0].status, "mastered");
  assert.equal(a.ayahs[1].status, "uncertain");
  assert.equal(a.mistakes.filter((m) => m.type === "omitted").length, 0);
  const after = applyRecitation(learned(), a, NOW, "rec_s");
  assert.equal(isWeak(after.progress["999:2"]), false, "an unfinished ayah is not marked weak");
  assert.deepEqual(after.progress["999:2"], learned().progress["999:2"], "and its state is untouched");
});

test("a differing word from a single recognizer is uncertain, shows what was heard, and is not scored", () => {
  const text = "ذهب الطالب الى المدرسة ليلا وقرأ الكتاب في المكتبة الكبيرة";
  const a = analyzeRecitation(AYAHS, tr(text), range);
  const w = a.ayahs[0].words[4];
  assert.equal(w.state, "uncertain");
  assert.equal(w.reason, "unconfirmed");
  assert.equal(w.heard, "ليلا", "what the recognizer heard is preserved");
  assert.equal(w.text, "صَبَاحًا", "the comparison shows the Quran/expected word separately");
  assert.equal(a.ayahs[0].status, "uncertain");
  const after = applyRecitation(learned(), a, NOW, "rec_d");
  assert.equal(isWeak(after.progress["999:1"]), false);
  assert.equal(a.transcript.text, text);
});

test("extra and repeated words are informational: they never lower accuracy or the status", () => {
  const a = analyzeRecitation(AYAHS, tr("ذهب الطالب الطالب الى المدرسة صباحا وقرأ الكتاب في المكتبة الكبيرة جدا"), range);
  assert.ok(a.mistakes.some((m) => m.type === "added"));
  assert.ok(a.ayahs.every((x) => x.status === "mastered"));
  assert.equal(a.accuracy, 1);
});

test("a low-confidence word from a model that reports probabilities stays uncertain; a confident one is confirmed", () => {
  const words = (c: number) => FULL.replace("صباحا", "ليلا").split(" ").map((t) => ({ text: t, confidence: t === "ليلا" ? c : 0.99 }));
  const text = FULL.replace("صباحا", "ليلا");
  assert.equal(analyzeRecitation(AYAHS, tr(text, { words: words(0.3), provider: "openai:whisper-1" }), range).ayahs[0].words[4].state, "uncertain");
  assert.equal(analyzeRecitation(AYAHS, tr(text, { words: words(0.97) }), range).ayahs[0].words[4].state, "incorrect");
});

// ── production recognizer guard ──────────────────────────────────────────
import { recitationPrimaryModel } from "../src/server/stt/provider";

test("the primary recognizer for recitation is always a Whisper model (the GPT-4o family silently corrects)", () => {
  assert.deepEqual(recitationPrimaryModel("whisper-1"), { model: "whisper-1", overridden: false });
  for (const m of ["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "gpt-transcribe", "gpt-4o-mini-transcribe-2025-12-15"]) {
    assert.deepEqual(recitationPrimaryModel(m), { model: "whisper-1", overridden: true }, m);
  }
});
