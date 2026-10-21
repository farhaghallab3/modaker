/**
 * Answers that used to be wrong: a weak keyword overlap was treated as evidence, so the assistant quoted
 * unrelated tafsir («كم عدد آيات البقرة» → 2:80 for containing «العدد»). Synthetic text only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNamedPassage, NAMED_PASSAGES } from "../src/server/rag/named-passages";
import { parseReferences } from "../src/server/rag/references";
import { createAssistant } from "../src/server/rag/assistant";
import { TafsirRetriever } from "../src/server/rag/retriever";
import { surahFact } from "../src/server/rag/surah-facts";
import { wordMeaningTarget } from "../src/server/rag/word-meaning";
import { QuranQuoteIndex } from "../src/server/safety/quote-verifier";
import { corpus, FakeQuran } from "./_fixtures";

test("facts about a surah come from the verified metadata, not from a tafsir search", () => {
  const ask = (q: string) => surahFact(q, parseReferences(q).surahs)?.text ?? null;
  assert.equal(ask("كم عدد آيات سورة البقرة؟"), "عدد آيات سورة البقرة ٢٨٦ آية.");
  assert.equal(ask("عدد آيات سورة الإخلاص"), "عدد آيات سورة الإخلاص ٤ آيات.");
  assert.equal(ask("هل سورة الملك مكية أم مدنية؟"), "سورة الملك مكية.");
  assert.equal(ask("ما ترتيب سورة الكهف في المصحف؟"), "سورة الكهف هي السورة رقم ١٨ في ترتيب المصحف.");
  assert.equal(ask("في أي صفحة تبدأ سورة يس؟"), "تبدأ سورة يس في الصفحة ٤٤٠ من مصحف المدينة النبوية.");
  // not factual questions
  assert.equal(ask("ما معنى سورة الملك؟"), null);
  assert.equal(ask("ما فضل سورة الملك؟"), null);
});

test("the assistant answers a surah fact directly, with the Quran as its source", async () => {
  const quran = new FakeQuran();
  const assistant = createAssistant({ quran, retriever: new TafsirRetriever(quran, "muyassar"), llm: null });
  const a = await assistant.answer({ question: "كم عدد آيات سورة البقرة؟" });
  assert.equal(a.text, "عدد آيات سورة البقرة ٢٨٦ آية.");
  assert.equal(a.provider, "quran-metadata");
  assert.equal(a.citations[0].sourceKind, "quran");
});

test("«ما معنى كلمة …» extracts the word being asked about", () => {
  assert.equal(wordMeaningTarget("ما معنى كلمة الصمد؟"), "الصمد");
  assert.equal(wordMeaningTarget("معنى كلمة الكوثر في القرآن"), "الكوثر");
  assert.equal(wordMeaningTarget("ما معنى سجيل"), "سجيل");
  assert.equal(wordMeaningTarget("ما معنى قوله تعالى الله نور السماوات والأرض"), null, "a phrase is not a word lookup");
  assert.equal(wordMeaningTarget("من هو قارون؟"), null);
});

test("a word is found in the verified text as a whole word, with an attached prefix allowed", () => {
  const index = new QuranQuoteIndex(corpus([112, 113]));
  const word = corpus([112])[1].textUthmani.split(" ")[0]; // a word of 112:2 (synthetic)
  const hits = index.findWord(word);
  assert.ok(hits.some((h) => h.surah === 112 && h.ayah === 2));
  assert.deepEqual(index.findWord("كلمةغيرموجودة"), []);
});

test("well-known passages named in a question resolve to their ranges", () => {
  assert.deepEqual(resolveNamedPassage("ما قصة أصحاب الفيل؟"), [{ surah: 105, from: 1, to: 5 }]);
  assert.deepEqual(resolveNamedPassage("من هو قارون"), [{ surah: 28, from: 76, to: 82 }]);
  assert.equal(resolveNamedPassage("ما معنى الصبر"), null);
  assert.ok(NAMED_PASSAGES.every((p) => p.ranges.every((r) => r.from <= r.to)));
});

test("inside a named surah, one common shared word is not evidence; two of the question's words are", async () => {
  const quran = new FakeQuran();
  const retriever = new TafsirRetriever(quran, "muyassar");
  // «الصبر» appears in half of all (synthetic) tafsir entries: not distinctive → nothing
  const weak = await retriever.retrieve("ماذا قيل عن الصبر في سورة البقرة", { refs: parseReferences("ماذا قيل عن الصبر في سورة البقرة"), limit: 3 });
  assert.equal(weak.length, 0);
  // both words of the question are in the passage → evidence
  const strong = await retriever.retrieve("الصبر والثبات في سورة البقرة", { refs: parseReferences("الصبر والثبات في سورة البقرة"), limit: 3 });
  assert.ok(strong.length > 0 && strong.every((p) => p.score >= 0.4));
});

test("asking about a short surah by name explains the whole surah", async () => {
  const quran = new FakeQuran();
  const retriever = new TafsirRetriever(quran, "muyassar");
  const short = await retriever.retrieve("ما معنى سورة الإخلاص", { refs: parseReferences("ما معنى سورة الإخلاص"), limit: 6 });
  assert.equal(short.length, 4);
  assert.ok(short.every((p) => p.score >= 0.4));
  const long = await retriever.retrieve("ما معنى سورة البقرة", { refs: parseReferences("ما معنى سورة البقرة"), limit: 6 });
  assert.ok(long.every((p) => p.score < 0.4), "a long surah's opening is not an answer");
});
