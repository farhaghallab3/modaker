/**
 * Tests use ordinary (non-Quranic) Arabic sentences on purpose: the test suite
 * must never contain hand-typed Quran text. Uthmani-style features (diacritics,
 * alef wasla, dagger alef, small high marks) are exercised synthetically.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRecitation } from "../src/lib/recitation/compare";
import { normalizeArabic, matchKey } from "../src/lib/quran/normalize";
import type { Ayah, Transcript } from "../src/lib/types";

const mk = (n: number, text: string): Ayah => ({ surah: 999, ayah: n, key: `999:${n}`, textUthmani: text });
const AYAHS = [
  mk(1, "ذَهَبَ ٱلطَّالِبُ إِلَى ٱلْمَدْرَسَةِ صَبَاحًا"),
  mk(2, "وَقَرَأَ ٱلْكِتَٰبَ فِى ٱلْمَكْتَبَةِ ٱلْكَبِيرَةِ"),
  mk(3, "ثُمَّ رَجَعَ إِلَىٰ بَيْتِهِۦ مَسْرُورًا"),
];
const range = { surah: 999, from: 1, to: 3 };
const tr = (text: string, words?: { text: string; start: number; end: number }[], extra: Partial<Transcript> = {}): Transcript => ({ text, words, provider: "test", language: "ar", ...extra });

test("normalization folds diacritics, wasla, dagger alef, small marks", () => {
  assert.equal(normalizeArabic("ٱلْكِتَٰبَ"), "الكتب");
  assert.equal(matchKey("ٱلْكِتَٰبَ"), matchKey("الكتاب"));
  assert.equal(normalizeArabic("بَيْتِهِۦ"), "بيته");
  assert.equal(normalizeArabic("إِلَىٰ"), "الي");
});

test("perfect recitation scores 100%", () => {
  const r = analyzeRecitation(AYAHS, tr("ذهب الطالب الى المدرسة صباحا وقرأ الكتاب في المكتبة الكبيرة ثم رجع إلى بيته مسرورا"), range);
  assert.equal(r.accuracy, 1);
  assert.equal(r.mistakes.length, 0);
  assert.ok(r.ayahs.every((a) => a.status === "mastered"));
});

test("a single recognizer's differences are uncertain; with independent corroboration they are omitted / incorrect / added", () => {
  const text = "ذهب الطالب الى المدرسة وقرأ الدرس في المكتبة الكبيرة جدا ثم رجع الى بيته مسرورا";
  const alone = analyzeRecitation(AYAHS, tr(text), range);
  assert.deepEqual(alone.mistakes.map((m) => `${m.type}:${m.ayahKey}`).sort(), ["added:999:2", "uncertain:999:1", "uncertain:999:2"]);
  assert.equal(alone.ayahs[0].words[4].state, "uncertain");
  assert.equal(alone.ayahs[1].words[1].heard, "الدرس");

  const both = analyzeRecitation(AYAHS, tr(text, undefined, { evidence: { kind: "none", secondOpinion: { provider: "g", text } } }), range);
  assert.deepEqual(both.mistakes.map((m) => `${m.type}:${m.ayahKey}`).sort(), ["added:999:2", "incorrect:999:2", "omitted:999:1"]);
  assert.equal(both.ayahs[0].words[4].state, "omitted");
});

test("detects ayah order problem", () => {
  const r = analyzeRecitation(AYAHS, tr("وقرأ الكتاب في المكتبة الكبيرة ذهب الطالب الى المدرسة صباحا ثم رجع الى بيته مسرورا"), range);
  assert.ok(r.mistakes.some((m) => m.type === "order"), JSON.stringify(r.mistakes));
  assert.ok(r.accuracy > 0.9);
});

test("handles split words (one written word spoken as two)", () => {
  const r = analyzeRecitation([mk(1, "يَٰٓأَصْدِقَآئِى ٱلْكِرَامُ")], tr("يا أصدقائي الكرام"), { surah: 999, from: 1, to: 1 });
  assert.equal(r.accuracy, 1, JSON.stringify(r.ayahs[0].words));
});

test("detects hesitation from word timings", () => {
  const words = "ذهب الطالب الى المدرسة صباحا".split(" ").map((t, i) => ({ text: t, start: i < 3 ? i : i + 4, end: (i < 3 ? i : i + 4) + 0.8 }));
  const r = analyzeRecitation([AYAHS[0]], tr(words.map((w) => w.text).join(" "), words), { surah: 999, from: 1, to: 1 });
  const h = r.mistakes.find((m) => m.type === "hesitation");
  assert.ok(h && h.pauseSec! >= 3);
});

// ── Reciting past the selected range ────────────────────────────────────
// Regression: a learner picked ayahs 1–5 of a surah, recited on to the end with wrong words in the
// following ayahs, and was shown "17 of 17 words, 100%": everything after the range was set aside as
// "extra" and never compared. The same situation, with the suite's non-Quranic sentences.
import { analyzeRecitationWithOverrun, trailingExtraWords } from "../src/lib/recitation/compare";

const firstTwo = { surah: 999, from: 1, to: 2 };
const pastRangeWrong = "ذهب الطالب الى المدرسة صباحا وقرأ الكتاب في المكتبة الكبيرة ثم رجع الى بيتنا مستورا";

test("recitation past the range: plain analysis sets the extra words aside (the reported 100%)", () => {
  const r = analyzeRecitation(AYAHS.slice(0, 2), tr(pastRangeWrong), firstTwo);
  assert.equal(r.accuracy, 1);
  assert.equal(r.extraWords.length, 5);
  assert.equal(trailingExtraWords(AYAHS.slice(0, 2), tr(pastRangeWrong)), 5);
});

test("recitation past the range: the following ayahs are checked and wrong words are flagged", () => {
  const r = analyzeRecitationWithOverrun(AYAHS.slice(0, 2), AYAHS.slice(2), tr(pastRangeWrong), firstTwo);
  assert.deepEqual(r.extendedFrom, firstTwo);
  assert.deepEqual(r.range, { surah: 999, from: 1, to: 3 });
  assert.equal(r.extraWords.length, 0);
  assert.ok(r.accuracy < 1, `accuracy ${r.accuracy}`);
  assert.equal(r.matchedWords, 13);
  assert.equal(r.expectedWords, 15);
  const flagged = r.ayahs[2].words.filter((w) => w.state !== "ok").map((w) => w.heard);
  assert.deepEqual(flagged, ["بيتنا", "مستورا"]);
  assert.notEqual(r.ayahs[2].status, "mastered");
});

test("recitation past the range: corroborated wrong words count as mistakes", () => {
  const t = tr(pastRangeWrong, undefined, { evidence: { kind: "none", secondOpinion: { provider: "g", text: pastRangeWrong } } });
  const r = analyzeRecitationWithOverrun(AYAHS.slice(0, 2), AYAHS.slice(2), t, firstTwo);
  assert.deepEqual(r.mistakes.filter((m) => m.type === "incorrect").map((m) => `${m.ayahKey}:${m.heard}`), ["999:3:بيتنا", "999:3:مستورا"]);
  assert.equal(r.ayahs[2].status, "needs-review");
});

test("recitation past the range: a correct continuation still scores 100%", () => {
  const text = "ذهب الطالب الى المدرسة صباحا وقرأ الكتاب في المكتبة الكبيرة ثم رجع إلى بيته مسرورا";
  const r = analyzeRecitationWithOverrun(AYAHS.slice(0, 2), AYAHS.slice(2), tr(text), firstTwo);
  assert.equal(r.range.to, 3);
  assert.equal(r.accuracy, 1);
  assert.ok(r.ayahs.every((a) => a.status === "mastered"));
});

test("recitation past the range: unrelated trailing speech does not extend the range", () => {
  const text = "ذهب الطالب الى المدرسة صباحا وقرأ الكتاب في المكتبة الكبيرة السلام عليكم ورحمة الله";
  const r = analyzeRecitationWithOverrun(AYAHS.slice(0, 2), AYAHS.slice(2), tr(text), firstTwo);
  assert.equal(r.extendedFrom, undefined);
  assert.deepEqual(r.range, firstTwo);
  assert.equal(r.extraWords.length, 4);
});

test("recitation past the range: no extension beyond the per-session maximum or without overrun", () => {
  const capped = analyzeRecitationWithOverrun(AYAHS.slice(0, 2), AYAHS.slice(2), tr(pastRangeWrong), firstTwo, 2);
  assert.equal(capped.extendedFrom, undefined);
  const exact = "ذهب الطالب الى المدرسة صباحا وقرأ الكتاب في المكتبة الكبيرة";
  const plain = analyzeRecitationWithOverrun(AYAHS.slice(0, 2), AYAHS.slice(2), tr(exact), firstTwo);
  assert.equal(plain.extendedFrom, undefined);
  assert.equal(plain.accuracy, 1);
});
