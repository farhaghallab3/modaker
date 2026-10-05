/**
 * Core memorization journey helpers. Like the other suites, these tests use
 * ordinary (non-Quranic) Arabic sentences — never hand-typed Quran text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRecitation } from "../src/lib/recitation/compare";
import { simulateTranscript } from "../src/lib/recitation/simulate";
import { clampRange, firstWord, memorizedRanges } from "../src/lib/recitation/ranges";
import { segmentsToWords } from "../src/lib/recitation/speech/timing";
import { ayahCountLabel, clockLabel, percentLabel, rangeLabel, relativeDueLabel } from "../src/lib/review/labels";
import { newAyahProgress } from "../src/lib/review/scheduler";
import type { Ayah } from "../src/lib/types";

const mk = (n: number, text: string): Ayah => ({ surah: 999, ayah: n, key: `999:${n}`, textUthmani: text });
const AYAHS = [
  mk(1, "ذَهَبَ ٱلطَّالِبُ إِلَى ٱلْمَدْرَسَةِ صَبَاحًا"),
  mk(2, "وَقَرَأَ ٱلْكِتَٰبَ فِى ٱلْمَكْتَبَةِ ٱلْكَبِيرَةِ"),
  mk(3, "ثُمَّ رَجَعَ إِلَىٰ بَيْتِهِۦ مَسْرُورًا"),
];

test("simulated transcript produces a realistic, imperfect analysis", () => {
  const t = simulateTranscript(AYAHS);
  assert.equal(t.provider, "dev:simulation");
  const r = analyzeRecitation(AYAHS, t, { surah: 999, from: 1, to: 3 });
  assert.ok(r.accuracy < 1 && r.accuracy > 0.6, `accuracy ${r.accuracy}`);
  const types = new Set(r.mistakes.map((m) => m.type));
  assert.ok(types.has("omitted"));
  assert.ok(types.has("hesitation"));
  // feedback words are always tokens of the verified text
  const expected = AYAHS.flatMap((a) => a.textUthmani.split(/\s+/));
  for (const a of r.ayahs) for (const w of a.words) assert.ok(expected.includes(w.text));
});

test("segment timings preserve gaps between results", () => {
  const w = segmentsToWords([
    { text: "ذهب الطالب", start: 0.5, end: 2 },
    { text: "وقرأ", start: 6, end: 7 },
  ]);
  assert.equal(w.length, 3);
  assert.ok(w[2].start! - w[1].end! >= 3);
  const r = analyzeRecitation([AYAHS[0]], { text: "", words: w, provider: "t", language: "ar" }, { surah: 999, from: 1, to: 1 });
  assert.ok(r.mistakes.some((m) => m.type === "hesitation"));
});

test("memorized ranges group contiguous ayahs per surah in chunks", () => {
  const ps = [1, 2, 3, 5, 6].map((a) => newAyahProgress(18, a)).concat([newAyahProgress(19, 1)]);
  assert.deepEqual(memorizedRanges(ps), [
    { surah: 18, from: 1, to: 3 },
    { surah: 18, from: 5, to: 6 },
    { surah: 19, from: 1, to: 1 },
  ]);
  const long = Array.from({ length: 25 }, (_, i) => newAyahProgress(2, i + 1));
  assert.equal(memorizedRanges(long, 10).length, 3);
});

test("clampRange bounds to surah and session max", () => {
  assert.deepEqual(clampRange(1, 0, 99, 7), { surah: 1, from: 1, to: 7, clamped: true });
  assert.deepEqual(clampRange(2, 10, 80, 286), { surah: 2, from: 10, to: 39, clamped: true });
  assert.equal(clampRange(2, 5, 9, 286).clamped, false);
});

test("firstWord skips annotation marks", () => {
  assert.equal(firstWord("ۚ ذَهَبَ ٱلطَّالِبُ"), "ذَهَبَ");
});

test("Arabic labels", () => {
  const now = new Date(2026, 0, 10, 9);
  assert.equal(relativeDueLabel(new Date(2026, 0, 10, 23), now), "اليوم");
  assert.equal(relativeDueLabel(new Date(2026, 0, 11, 1), now), "غدًا");
  assert.equal(relativeDueLabel(new Date(2026, 0, 13), now), "بعد ٣ أيام");
  assert.equal(relativeDueLabel(new Date(2026, 0, 12), now), "بعد يومين");
  assert.equal(ayahCountLabel(1), "آية واحدة");
  assert.equal(ayahCountLabel(4), "٤ آيات");
  assert.equal(ayahCountLabel(12), "١٢ آية");
  assert.equal(percentLabel(0.94), "٩٤٪");
  assert.equal(rangeLabel(5, 9), "الآيات ٥–٩");
  assert.equal(clockLabel(204), "٠٣:٢٤");
});
