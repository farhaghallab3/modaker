/** Reference parsing from Arabic questions (surah names are metadata, not Quran text). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SURAHS } from "../src/lib/quran/surahs";
import { parseReferences, toLatinDigits } from "../src/server/rag/references";

const p = parseReferences;

test("Arabic-Indic and Persian digits are converted", () => {
  assert.equal(toLatinDigits("٣٢ و ۱۲"), "32 و 12");
});

test("surah + ayah in several phrasings", () => {
  const want = { surahs: [19], ranges: [{ surah: 19, from: 32, to: 32 }] };
  for (const q of ["ما معنى الآية 32 من سورة مريم؟", "ما معنى الآية ٣٢ من سورة مريم؟", "سورة مريم آية ٣٢", "مريم 32", "فسر مريم ٣٢", "19:32", "اشرح ١٩:٣٢"]) {
    const r = p(q);
    assert.deepEqual({ surahs: r.surahs, ranges: r.ranges }, want, q);
    assert.equal(r.fromContext, false, q);
  }
});

test("ranges: dash, 'من … إلى', key ranges, and two-ayah forms", () => {
  assert.deepEqual(p("اشرح الآيات 1-5 من سورة الملك").ranges, [{ surah: 67, from: 1, to: 5 }]);
  assert.deepEqual(p("الآيات من 3 إلى 6 في سورة الكهف").ranges, [{ surah: 18, from: 3, to: 6 }]);
  assert.deepEqual(p("18:1-10").ranges, [{ surah: 18, from: 1, to: 10 }]);
  assert.deepEqual(p("سورة الملك الآيتين 4 و 5").ranges, [{ surah: 67, from: 4, to: 5 }]);
});

test("ordinal ayah words", () => {
  assert.deepEqual(p("ما معنى الآية الأولى من سورة الكهف").ranges, [{ surah: 18, from: 1, to: 1 }]);
  assert.deepEqual(p("فسر الآية الأخيرة من سورة الملك").ranges, [{ surah: 67, from: 30, to: 30 }]);
});

test("'ال' variants: with and without 'سورة', and the article dropped after 'سورة'", () => {
  assert.deepEqual(p("اشرح الملك").surahs, [67]);
  assert.deepEqual(p("اشرح سورة الملك").surahs, [67]);
  assert.deepEqual(p("سورة ملك").surahs, [67]);
  assert.deepEqual(p("ما فضل سورة كهف").surahs, [18]);
});

test("hamza / ta-marbuta / alef-maqsura spelling variants and clitics", () => {
  assert.deepEqual(p("سورة الاسراء").surahs, [17]);
  assert.deepEqual(p("سورة الإسراء").surahs, [17]);
  assert.deepEqual(p("سوره البقره").surahs, [2]);
  assert.deepEqual(p("سورة الضحي").surahs, [93]);
  assert.deepEqual(p("ماذا ورد بسورة يوسف").surahs, [12]);
  assert.deepEqual(p("آل عمران الآية 7").ranges, [{ surah: 3, from: 7, to: 7 }]);
  assert.deepEqual(p("سورة ال عمران").surahs, [3]);
});

test("prophet/story names map to their surah ('يوسف')", () => {
  assert.deepEqual(p("ما قصة يوسف").surahs, [12]);
});

test("every one of the 114 names is recognised after 'سورة'", () => {
  for (const s of SURAHS) {
    assert.deepEqual(p(`ما معنى سورة ${s.nameAr}`).surahs, [s.number], s.nameAr);
  }
});

test("alternate names", () => {
  assert.deepEqual(p("سورة تبارك").surahs, [67]);
  assert.deepEqual(p("سورة براءة").surahs, [9]);
  assert.deepEqual(p("سورة بني إسرائيل").surahs, [17]);
});

test("common-word names need 'سورة' or a number (no false positives)", () => {
  assert.deepEqual(p("كيف أكون نافعا للناس").surahs, []);
  assert.deepEqual(p("ما فضل صلاة الفجر في الجماعة").surahs, []);
  assert.deepEqual(p("سورة الناس").surahs, [114]);
  assert.deepEqual(p("النور 35").ranges, [{ surah: 24, from: 35, to: 35 }]);
  assert.deepEqual(p("سورة ق").surahs, [50]);
  assert.deepEqual(p("ق").surahs, []);
});

test("two surahs: each ayah attaches to the nearest mention", () => {
  const r = p("قارن بين الآية 3 من سورة الكهف والآية 10 من سورة مريم");
  assert.deepEqual(r.surahs, [18, 19]);
  assert.deepEqual(r.ranges, [
    { surah: 18, from: 3, to: 3 },
    { surah: 19, from: 10, to: 10 },
  ]);
});

test("invalid ayah numbers are dropped, over-long ranges clamped", () => {
  assert.deepEqual(p("الآية 99 من سورة الملك").ranges, []);
  assert.deepEqual(p("الآيات 25-40 من سورة الملك").ranges, [{ surah: 67, from: 25, to: 30 }]);
  assert.deepEqual(p("114:7").ranges, []);
});

test("UI context: used when the question has no explicit reference", () => {
  const ctx = { surah: 67, ayah: 2, storySlug: "ashab-al-kahf" };
  const r = p("ما معنى هذه الآية؟", ctx);
  assert.deepEqual(r.ranges, [{ surah: 67, from: 2, to: 2 }]);
  assert.equal(r.fromContext, true);
  assert.equal(r.storySlug, "ashab-al-kahf");

  // ayah number only → context surah
  assert.deepEqual(p("اشرح الآية 5", { surah: 18 }).ranges, [{ surah: 18, from: 5, to: 5 }]);
  // explicit surah wins over context
  const explicit = p("اشرح سورة مريم", { surah: 67, ayah: 2 });
  assert.deepEqual(explicit.surahs, [19]);
  assert.deepEqual(explicit.ranges, []);
  assert.equal(explicit.fromContext, false);
});

test("no references, no context → empty", () => {
  const r = p("ما فضل الصبر؟");
  assert.deepEqual(r, { surahs: [], ranges: [], storySlug: undefined, fromContext: false });
});
