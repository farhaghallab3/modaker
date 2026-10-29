/**
 * «الشيخ المعلّم»: facts from a recitation, the template script, the validation of an AI script (never Quran text,
 * only known words and numbers) and the fallback. Synthetic words only (made-up Arabic letters), no Quran text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTeacherFacts,
  containsQuranText,
  joinSayings,
  templateScript,
  validateScript,
  type TeacherFacts,
} from "../src/lib/recitation/teacher-script";
import { writeTeacherScript } from "../src/server/teacher";
import type { RecitationAnalysis } from "../src/lib/types";
import type { TajweedResult } from "../src/lib/recitation/tajweed-notes";

type W = RecitationAnalysis["ayahs"][number]["words"][number];
const ok = (text: string): W => ({ text, state: "ok" });

function analysis(): RecitationAnalysis {
  const ayahs: RecitationAnalysis["ayahs"] = [
    { key: "2:1", ayah: 1, accuracy: 1, status: "mastered", words: [ok("كتبنا"), ok("سمعنا"), ok("رسمنا")], mistakes: [] },
    { key: "2:2", ayah: 2, accuracy: 0.5, status: "needs-review", words: [ok("درسنا"), { text: "نقلنا", state: "omitted" }, { text: "حملنا", state: "incorrect", heard: "حمدنا" }, ok("قطفنا")], mistakes: [] },
    { key: "2:3", ayah: 3, accuracy: 0, status: "uncertain", words: [{ text: "زرعنا", state: "omitted" }, { text: "حصدنا", state: "omitted" }], mistakes: [] },
  ];
  return {
    range: { surah: 2, from: 1, to: 3 },
    accuracy: 0.55,
    ayahs,
    mistakes: [],
    extraWords: [],
    uncertainWords: 0,
    matchedWords: 5,
    expectedWords: 9,
    recognition: "good",
    learningEligible: true,
    transcript: { text: "x", provider: "test", language: "ar" },
    textOnly: true,
  };
}

const tajweed: TajweedResult = {
  matched: 2,
  notes: [{ ayah: 2, word: 3, wordsInAyah: 4, kind: "harakat", op: "replace", rule: null, expectedLen: null, heardLen: null, letter: "د", expected: "دُ", heard: "دَ" }],
  good: [{ ayah: 1, word: 0, wordsInAyah: 3, rule: "madd_lazem" }],
  heardAyahs: [1, 2, 3],
};

const ayahTexts = ["كتبنا سمعنا رسمنا", "درسنا نقلنا حملنا قطفنا", "زرعنا حصدنا"];

test("facts: what was read, what was skipped, each word to fix, tajweed notes and praise (no Quran text)", () => {
  const f = buildTeacherFacts(analysis(), tajweed, "أحسنت فيما قرأت.");
  assert.equal(f.accuracyPercent, 56);
  assert.deepEqual(f.notRecited, [3]);
  assert.deepEqual(f.wordProblems.map((p) => [p.id, p.problem]), [["w2_1", "omitted"], ["w2_2", "different"]]);
  assert.equal(f.wordProblems[0].place, "الآية الثانية، الكلمة الثانية");
  assert.equal(f.tajweedNotes[0].id, "w2_3");
  assert.match(f.tajweedNotes[0].what, /حرف الدال/);
  assert.deepEqual(f.tajweedGood, [{ id: "w1_0", place: "الآية الأولى، الكلمة الأولى", rule: "المدّ اللازم" }]);
  assert.ok(f.ayahs.every((a) => a.heardByTajweedChecker));
  const json = JSON.stringify(f);
  for (const w of ayahTexts.join(" ").split(" ")) assert.ok(!json.includes(w), `facts must not carry the word ${w}`);
});

test("template: praise first, then what was not heard, each word followed by the reciter, then encouragement", () => {
  const f = buildTeacherFacts(analysis(), tajweed);
  const s = templateScript(f, 7);
  const says = s.filter((x): x is { say: string } => "say" in x).map((x) => x.say);
  assert.match(says[0], /الآية الأولى/); // the mastered ayah is praised
  assert.match(says[1], /المدّ اللازم/); // a rule read well is praised
  assert.ok(says.some((x) => /سمعت صوتك في الآية الثالثة/.test(x))); // heard by the checker, words unclear
  const words = s.filter((x) => "word" in x).map((x) => ("word" in x ? `${x.word.ayah}:${x.word.word}` : ""));
  assert.deepEqual(words, ["2:1", "2:2", "2:3"]);
  // every word comes right after «اسمعها من الشيخ»
  s.forEach((x, i) => "word" in x && assert.match((s[i - 1] as { say: string }).say, /اسمعها من الشيخ/));
  assert.ok(validateScript({ segments: s.map((x) => ("word" in x ? { word: `w${x.word.ayah}_${x.word.word}` } : x)) }, f, ayahTexts));
  // perfect recitation: praise only
  const perfect: TeacherFacts = { ...f, wordProblems: [], tajweedNotes: [], notRecited: [], tajweedGood: [], ayahs: f.ayahs.map((a) => ({ ...a, status: "mastered" })) };
  assert.equal(templateScript(perfect, 1).filter((x) => "word" in x).length, 0);
});

test("a sentence with Quran text is never spoken; praise phrases are fine", () => {
  assert.equal(containsQuranText("أحسنت، قرأت الآية الثانية جيدًا.", ayahTexts), false);
  assert.equal(containsQuranText("ما شاء الله، بارك الله فيك.", ayahTexts), false);
  assert.equal(containsQuranText("قل: درسنا نقلنا بهدوء", ayahTexts), true); // two words in a row
  assert.equal(containsQuranText("الكلمة هي حملنا", ayahTexts), true); // one long distinctive word
});

test("an AI script is checked against the facts", () => {
  const f = buildTeacherFacts(analysis(), tajweed);
  const good = { segments: [{ say: "ما شاء الله، أتقنت الآية الأولى." }, { say: "في الآية الثانية، الكلمة الثانية لم أسمعها. اسمعها من الشيخ:" }, { word: "w2_1" }, { say: "أعدها بهدوء." }] };
  assert.equal(validateScript(good, f, ayahTexts)?.length, 4);
  assert.equal(validateScript({ segments: [{ say: "اسمعها:" }, { word: "w1_2" }] }, f, ayahTexts), null); // a word the facts do not name
  assert.equal(validateScript({ segments: [{ say: "قرأت 37 كلمة صحيحة." }] }, f, ayahTexts), null); // a number not in the facts
  assert.equal(validateScript({ segments: [{ say: "قرأت 3 آيات." }] }, f, ayahTexts)?.length, 1);
  assert.equal(validateScript({ segments: [{ say: "قال رسول الله في حديث كذا." }] }, f, ayahTexts), null);
  assert.equal(validateScript({ segments: [{ say: "والصحيح: درسنا نقلنا." }] }, f, ayahTexts), null);
  assert.equal(validateScript({ segments: [] }, f, ayahTexts), null);
  assert.equal(validateScript({ segments: [{ word: "w2_1" }] }, f, ayahTexts), null); // nothing said
  assert.equal(validateScript("junk", f, ayahTexts), null);
});

test("the AI writes the script when it can; any failure falls back to the template", async () => {
  const f = buildTeacherFacts(analysis(), tajweed);
  const llm = (answer: string | Error) => ({
    id: "fake",
    complete: async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
  const ai = await writeTeacherScript(f, ayahTexts, 1, llm('```json\n{"segments":[{"say":"أحسنت يا بطل، أتقنت الآية الأولى."}]}\n```'));
  assert.equal(ai.source, "ai");
  assert.deepEqual(ai.segments, [{ say: "أحسنت يا بطل، أتقنت الآية الأولى." }]);
  assert.equal((await writeTeacherScript(f, ayahTexts, 1, llm('{"segments":[{"say":"والصحيح: درسنا نقلنا"}]}'))).source, "template");
  assert.equal((await writeTeacherScript(f, ayahTexts, 1, llm(new Error("down")))).source, "template");
  assert.equal((await writeTeacherScript(f, ayahTexts, 1, null)).source, "template");
});

test("neighbouring sentences are said in one breath", () => {
  assert.deepEqual(joinSayings([{ say: "أ" }, { say: "ب" }, { word: { ayah: 1, word: 0 } }, { say: "ج" }]), [{ say: "أ ب" }, { word: { ayah: 1, word: 0 } }, { say: "ج" }]);
});
