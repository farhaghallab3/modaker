/**
 * Post-generation verification: whatever the model writes, only what can be proven from the
 * retrieved passages survives. No Quran text appears here; passages are ordinary sentences.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterCitations, verifyGeneratedAnswer, type VerifierPassage } from "../src/server/safety/answer-verifier";
import { isApproved } from "../src/server/rag/sources";

const P: VerifierPassage[] = [
  { text: "ذهب الطالب إلى المدرسة مبكرا وقرأ الكتاب في المكتبة الهادئة", labels: ["التفسير الميسر", "مجمع الملك فهد"] },
  { text: "قال المفسر إن العمل والاجتهاد في طلب العلم يرفعان صاحبهما", labels: ["التفسير الميسر"] },
];

test("a well-cited answer passes untouched", () => {
  const r = verifyGeneratedAnswer("يبين الشرح أن الطالب اجتهد في الذهاب مبكرا [1]. ويرتبط ذلك بفضل العمل والاجتهاد [2].", P);
  assert.equal(r.supported, true);
  assert.deepEqual(r.citations, [1, 2]);
  assert.equal(r.issues.length, 0);
});

test("a citation to a passage that was never given is removed (citations cannot be invented)", () => {
  const r = verifyGeneratedAnswer("الطالب ذهب مبكرا [1]. والعامل اجتهد في العمل [7].", P);
  assert.deepEqual(r.citations, [1]);
  assert.ok(r.issues.some((i) => i.code === "invalid_citation"));
  assert.ok(!r.text.includes("[7]"));
  assert.ok(!r.text.includes("والعامل"), "the sentence supported only by the invalid citation is dropped");
});

test("uncited sentences are dropped", () => {
  const r = verifyGeneratedAnswer("معلومة بلا مصدر تمامًا. الطالب ذهب مبكرا [1].", P);
  assert.ok(!r.text.includes("بلا مصدر"));
  assert.ok(r.issues.some((i) => i.code === "uncited_sentence"));
  assert.equal(r.supported, true);
});

test("a quotation that is not a verbatim fragment of a retrieved passage is removed", () => {
  const ok = verifyGeneratedAnswer("جاء في الشرح «الاجتهاد في طلب العلم» [2].", P);
  assert.ok(ok.text.includes("«الاجتهاد في طلب العلم»"));
  const bad = verifyGeneratedAnswer("جاء في الشرح «نص لم يقله المفسر أبدا» [2].", P);
  assert.ok(!bad.text.includes("نص لم يقله"));
  assert.ok(bad.issues.some((i) => i.code === "unsupported_quote"));
});

test("fabricated hadith attribution is dropped unless the retrieved material contains it", () => {
  const fake = verifyGeneratedAnswer("قال رسول الله كلامًا في فضل العلم [2]. الطالب ذهب مبكرا [1].", P);
  assert.ok(!fake.text.includes("قال رسول الله"));
  assert.ok(fake.issues.some((i) => i.code === "fabricated_hadith"));
  assert.ok(fake.text.includes("الطالب ذهب مبكرا"));

  const narrator = verifyGeneratedAnswer("رواه البخاري في صحيحه [1].", P);
  assert.equal(narrator.supported, false);

  const grounded = verifyGeneratedAnswer("ورد في المقطع: رواه البخاري [1].", [{ text: "نص يذكر أنه رواه البخاري في كتابه", labels: [] }]);
  assert.equal(grounded.supported, true, "an attribution that really appears in the passage is allowed");
});

test("a named scholar or book that no retrieved passage or source mentions is dropped", () => {
  const r = verifyGeneratedAnswer("قال ابن كثير في ذلك قولًا مفصلًا [1]. الطالب ذهب مبكرا [1].", P);
  assert.ok(!r.text.includes("ابن كثير"));
  assert.ok(r.issues.some((i) => i.code === "unsupported_attribution"));
  const named = verifyGeneratedAnswer("يذكر التفسير الميسر هذا المعنى [1].", P);
  assert.equal(named.supported, true);
});

test("verse-like text is replaced by a pointer to the verified verse", () => {
  const r = verifyGeneratedAnswer("المعنى هو الثبات [1] ﴿نص آية مولد من النموذج﴾", P);
  assert.ok(!r.text.includes("﴿"));
  assert.ok(r.issues.some((i) => i.code === "verse_text"));
});

test("when nothing verifiable survives the answer is reported unsupported", () => {
  for (const raw of ["كلام عام بلا أي توثيق.", "قال رسول الله شيئًا [1].", "معلومة [9]."]) {
    const r = verifyGeneratedAnswer(raw, P);
    assert.equal(r.supported, false, raw);
  }
});

test("filterCitations drops sources that are unknown, disabled, or were not retrieved", () => {
  const retrieved = [{ sourceId: "tafsir:muyassar", ref: "x" }];
  const cites = [
    { sourceId: "tafsir:muyassar", ref: "x" },
    { sourceId: "tafsir:ibn-kathir", ref: "y" }, // registered but disabled
    { sourceId: "muzakkir-curated", ref: "z" }, // editorial/demo source — disabled
    { sourceId: "made-up:source", ref: "w" },
  ];
  const { kept, dropped } = filterCitations(cites, retrieved, isApproved);
  assert.deepEqual(kept.map((c) => c.sourceId), ["tafsir:muyassar"]);
  assert.equal(dropped.length, 3);
  // a usable source that was NOT retrieved is dropped too
  const notRetrieved = filterCitations([{ sourceId: "quran-com:uthmani", ref: "q" }], retrieved, isApproved);
  assert.equal(notRetrieved.kept.length, 0);
});
