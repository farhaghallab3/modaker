/**
 * Quran quotation verification against a synthetic verified corpus (no real Quran text in repo).
 * The assistant must never reason over a corrupted ayah as if it were scripture.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { QuranQuoteIndex } from "../src/server/safety/quote-verifier";
import { corpus, fakeAyahText } from "./_fixtures";

const index = new QuranQuoteIndex(corpus([67, 112, 18, 1]));
const words = (s: number, a: number) => fakeAyahText(s, a).split(" ");

test("an exact quotation (delimited, or a clean fragment inside prose) is recognised, not 'corrected'", () => {
  const w = words(67, 5);
  const delimited = index.check(`ما معنى «${w.join(" ")}»`);
  assert.equal(delimited.status, "exact");
  if (delimited.status === "exact") {
    assert.equal(delimited.match.surah, 67);
    assert.equal(delimited.match.from, 5);
  }
  const fragment = index.check(`ما معنى ${w.slice(0, 4).join(" ")}؟`);
  assert.equal(fragment.status, "exact");
});

test("spelling/diacritic differences are not mistakes", () => {
  const t = fakeAyahText(67, 7)
    .replace(/ا/g, "أ")
    .split(" ")
    .map((x) => `${x}ً`)
    .join(" ");
  assert.equal(index.check(`«${t}»`).status, "exact");
});

test("a quotation with a wrong word is corrected to the verified ayah, with surah and ayah", () => {
  const w = words(67, 9);
  const wrong = [...w];
  wrong[2] = "الصحراء"; // a different ordinary word
  const r = index.check(`ما معنى «${wrong.join(" ")}»`);
  assert.equal(r.status, "corrected");
  if (r.status === "corrected") {
    assert.deepEqual([r.match.surah, r.match.from, r.match.to], [67, 9, 9]);
    assert.equal(r.match.verses[0].textUthmani, fakeAyahText(67, 9), "the verified text comes from the corpus");
    assert.ok(r.match.similarity >= 0.7);
  }
});

test("missing or extra words inside a quotation are detected and corrected", () => {
  const w = words(18, 12);
  const dropped = index.check(`«${w.filter((_, i) => i !== 3).join(" ")}»`);
  assert.equal(dropped.status, "corrected");
  if (dropped.status === "corrected") {
    assert.equal(dropped.match.from, 12);
    assert.equal(dropped.match.diff.missing.length, 1);
  }
  const extra = index.check(`«${[...w.slice(0, 3), "جدا", ...w.slice(3)].join(" ")}»`);
  assert.equal(extra.status, "corrected");
  if (extra.status === "corrected") assert.ok(extra.match.diff.extra.includes("جدا"));
});

test("a quotation spanning consecutive ayahs is matched across them", () => {
  const a = words(67, 5);
  const b = words(67, 6);
  const wrong = [...b];
  wrong[1] = "الصحراء";
  const r = index.check(`«${[...a, ...wrong].join(" ")}»`);
  assert.equal(r.status, "corrected");
  if (r.status === "corrected") assert.deepEqual([r.match.from, r.match.to], [5, 6]);
});

test("low confidence → ambiguous: candidates are offered, nothing is guessed", () => {
  const x = words(67, 5);
  const y = words(18, 10);
  const mixed = [...x.slice(0, 3), ...y.slice(-3)];
  const r = index.check(`«${mixed.join(" ")}»`);
  assert.equal(r.status, "ambiguous");
  if (r.status === "ambiguous") {
    assert.ok(r.candidates.length >= 2);
    const refs = r.candidates.map((c) => `${c.surah}:${c.from}`);
    assert.ok(refs.includes("67:5") && refs.includes("18:10"));
  }
});

test("a quotation after «قال تعالى» is treated as explicit", () => {
  const w = words(67, 11);
  w[1] = "الصحراء";
  const r = index.check(`ما تفسير قال تعالى: ${w.join(" ")}`);
  assert.equal(r.status, "corrected");
});

test("ordinary questions are left alone (no false positives)", () => {
  for (const q of [
    "ما هي فوائد المطر على الحقل والفلاح في القرية؟",
    "كيف أحفظ سورة الملك بسرعة؟",
    "لماذا يعبد المسلمون الكعبة؟",
    "هل القرآن من تأليف محمد؟",
  ]) {
    assert.equal(index.check(q).status, "none", q);
  }
});

test("a quotation hidden in prose must clear a high bar: one wrong word is corrected, a loose resemblance is not", () => {
  const w = words(67, 5);
  const wrong = [...w];
  wrong[3] = "الصحراء";
  assert.equal(index.check(`ما معنى ${wrong.join(" ")} في رأيك؟`).status, "corrected");
  const loose = `ما معنى ${w[0]} ثم ${w[1]} وبعد ذلك الشيء ${w[2]} وكذلك الأمر`;
  assert.equal(index.check(loose).status, "none");
});

test("very short fragments are never treated as quotations", () => {
  assert.equal(index.check("«الطالب المدرسة»").status, "none");
});
