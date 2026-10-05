/**
 * Tests use ordinary (non-Quranic) Arabic sentences on purpose: the test suite
 * must never contain hand-typed Quran text. Uthmani-style features (diacritics,
 * alef wasla, dagger alef, small high marks) are exercised synthetically.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRecitation } from "../src/lib/recitation/compare";
import { normalizeArabic, matchKey } from "../src/lib/quran/normalize";
import type { Ayah } from "../src/lib/types";

const mk = (n: number, text: string): Ayah => ({ surah: 999, ayah: n, key: `999:${n}`, textUthmani: text });
const AYAHS = [
  mk(1, "ذَهَبَ ٱلطَّالِبُ إِلَى ٱلْمَدْرَسَةِ صَبَاحًا"),
  mk(2, "وَقَرَأَ ٱلْكِتَٰبَ فِى ٱلْمَكْتَبَةِ ٱلْكَبِيرَةِ"),
  mk(3, "ثُمَّ رَجَعَ إِلَىٰ بَيْتِهِۦ مَسْرُورًا"),
];
const range = { surah: 999, from: 1, to: 3 };
const tr = (text: string, words?: { text: string; start: number; end: number }[]) => ({ text, words, provider: "test", language: "ar" });

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

test("detects omitted, incorrect and added words", () => {
  const r = analyzeRecitation(AYAHS, tr("ذهب الطالب الى المدرسة وقرأ الدرس في المكتبة الكبيرة جدا ثم رجع الى بيته مسرورا"), range);
  const types = r.mistakes.map((m) => `${m.type}:${m.ayahKey}`).sort();
  assert.deepEqual(types, ["added:999:2", "incorrect:999:2", "omitted:999:1"]);
  assert.equal(r.ayahs[0].words[4].state, "omitted");
  assert.equal(r.ayahs[1].words[1].heard, "الدرس");
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
