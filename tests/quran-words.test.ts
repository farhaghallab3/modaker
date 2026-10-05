/**
 * Quran-specific normalization and alignment for commonly confused words. Single words only — no
 * ayah text lives in this repository; sequences below are arbitrary orderings of individual words.
 *
 * Two rules are tested together:
 *   1. orthographic variants (diacritics, Uthmani marks, alef/hamza/yeh forms) are the SAME word;
 *   2. genuinely different words are NEVER made equal by normalization or fuzzy matching.
 * This is memorized-word comparison — not tajweed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchKey, normalizeArabic } from "../src/lib/quran/normalize";
import { analyzeRecitation, isSameWord } from "../src/lib/recitation/compare";
import { plausibleRecognitionConfusion, weightedLetterDistance } from "../src/lib/recitation/confusion";
import type { Ayah, Transcript } from "../src/lib/types";

/** word → [Uthmani form (as in the verified text), …variants a recognizer or user may produce]. */
const WORDS: Record<string, { uthmani: string; variants: string[] }> = {
  الصراط: { uthmani: "ٱلصِّرَٰطَ", variants: ["الصراط", "الصِّراط", "الصِّرَاطَ", "الصراط"] },
  المستقيم: { uthmani: "ٱلْمُسْتَقِيمَ", variants: ["المستقيم", "المُستقيم", "ٱلمستقيم"] },
  الرحمن: { uthmani: "ٱلرَّحْمَـٰنِ", variants: ["الرحمن", "الرحمان", "الرَّحمٰن", "الرَّحْمَنِ"] },
  الرحيم: { uthmani: "ٱلرَّحِيمِ", variants: ["الرحيم", "الرَّحيم", "الرحيمِ"] },
  إياك: { uthmani: "إِيَّاكَ", variants: ["إياك", "اياك", "إيّاك", "ايّاك"] },
  نستعين: { uthmani: "نَسْتَعِينُ", variants: ["نستعين", "نَستَعين", "نستعينُ"] },
  الضالين: { uthmani: "ٱلضَّآلِّينَ", variants: ["الضالين", "الضّالين", "الضَّالِّينَ", "الضآلين"] },
};

const ayah = (text: string): Ayah => ({ surah: 1, ayah: 1, key: "1:1", textUthmani: text });
const transcript = (text: string, extra: Partial<Transcript> = {}): Transcript => ({ text, provider: "test", language: "ar", ...extra });

// ── 1. same word, different spelling ─────────────────────────────────────

test("every spelling/diacritic variant of a Quranic word reduces to the same match key", () => {
  for (const [plain, { uthmani, variants }] of Object.entries(WORDS)) {
    const key = matchKey(uthmani);
    assert.equal(matchKey(plain), key, `${plain} (plain) vs Uthmani`);
    for (const v of variants) assert.equal(matchKey(v), key, `${v} vs ${plain}`);
  }
});

test("normalization folds the forms it should — and only those", () => {
  assert.equal(normalizeArabic("ٱلصِّرَٰطَ"), "الصرط", "diacritics, alef wasla and dagger alef fold");
  assert.equal(normalizeArabic("إِيَّاكَ"), "اياك", "hamza-under-alef folds to alef");
  assert.equal(normalizeArabic("ٱلضَّآلِّينَ"), "الضالين", "maddah and shadda fold");
  assert.equal(normalizeArabic("الصراط"), "الصراط");
  // letters are NEVER changed into other letters
  assert.notEqual(normalizeArabic("ٱلصِّرَٰطَ"), normalizeArabic("السراط"));
  assert.notEqual(normalizeArabic("ٱلصِّرَٰطَ"), normalizeArabic("الطرق"));
});

// ── 2. different words stay different ────────────────────────────────────

test("genuinely different Arabic words are never made equal", () => {
  const different: [string, string][] = [
    ["الصراط", "الطرق"], // the reported recognition error
    ["الصراط", "التراث"],
    ["الصراط", "الصلاة"],
    ["الرحمن", "الرحيم"], // two different divine names
    ["الرحيم", "الرحمن"],
    ["إياك", "إياه"],
    ["نستعين", "نعبد"],
    ["نستعين", "نستعيذ"],
    ["الضالين", "الظالين"], // ض vs ظ: a different word
    ["الضالين", "المغضوب"],
    ["المستقيم", "المستقيمة"],
  ];
  for (const [a, b] of different) {
    assert.notEqual(matchKey(a), matchKey(b), `${a} ≠ ${b} (keys)`);
    assert.equal(isSameWord(matchKey(a), matchKey(b)), false, `${a} ≠ ${b} (fuzzy)`);
  }
});

test("a near-miss is accepted as the same word only for long keys, never for short ones", () => {
  assert.equal(isSameWord(matchKey("الضالين"), matchKey("الظالين")), false, "5-letter key: one letter changes the word");
  assert.equal(isSameWord(matchKey("الصراط"), matchKey("السراط")), false);
  assert.equal(isSameWord(matchKey("المستقيم"), matchKey("المستقين")), true, "7-letter key: one-letter spelling noise");
});

// ── 3. alignment: same words match, different words are reported ─────────

const SEQUENCE = ["الصراط", "المستقيم", "الرحمن", "الرحيم", "إياك", "نستعين", "الضالين"];
const expectedText = SEQUENCE.map((w) => WORDS[w].uthmani).join(" ");

test("the verified Uthmani words align one-to-one with their plain/diacritic-free spellings", () => {
  for (const variantIndex of [0, 1, 2]) {
    const spoken = SEQUENCE.map((w) => WORDS[w].variants[Math.min(variantIndex, WORDS[w].variants.length - 1)]).join(" ");
    const a = analyzeRecitation([ayah(expectedText)], transcript(spoken), { surah: 1, from: 1, to: 1 });
    assert.equal(a.mistakes.length, 0, `variant set ${variantIndex}: ${JSON.stringify(a.mistakes)}`);
    assert.equal(a.accuracy, 1);
    assert.equal(a.ayahs[0].status, "mastered");
  }
});

test("the recognizer's text is reported as heard — never replaced by the expected word", () => {
  const spoken = ["الطرق", "المستقيم", "الرحمن", "الرحيم", "إياك", "نستعين", "الضالين"].join(" ");
  const a = analyzeRecitation([ayah(expectedText)], transcript(spoken), { surah: 1, from: 1, to: 1 });
  assert.equal(a.transcript.text, spoken, "the transcript is returned unchanged");
  const m = a.mistakes.find((x) => x.expected === WORDS["الصراط"].uthmani)!;
  assert.equal(m.heard, "الطرق", "what was heard is kept verbatim");
});

test("each different word, said instead of the expected one, is NOT counted as correct", () => {
  const replacements: [string, string][] = [
    ["الصراط", "الطرق"], ["المستقيم", "المستقبل"], ["الرحمن", "الرحيم"], ["الرحيم", "الرحمن"],
    ["إياك", "إياه"], ["نستعين", "نعبد"], ["الضالين", "الظالين"],
  ];
  for (const [word, wrong] of replacements) {
    const spoken = SEQUENCE.map((w) => (w === word ? wrong : WORDS[w].variants[0])).join(" ");
    const a = analyzeRecitation([ayah(expectedText)], transcript(spoken), { surah: 1, from: 1, to: 1 });
    const idx = SEQUENCE.indexOf(word);
    const state = a.ayahs[0].words[idx].state;
    assert.notEqual(state, "ok", `${word} ← ${wrong} must not be accepted as correct`);
    assert.ok(a.accuracy < 1 || a.uncertainWords > 0, `${word} ← ${wrong}`);
  }
});

// ── 4. confusion plausibility is a doubt signal, never equality ──────────

test("plausible recognition confusions are flagged as such — but remain different words", () => {
  const key = (w: string) => matchKey(w);
  assert.equal(plausibleRecognitionConfusion(key("الصراط"), key("الطرق")), true, "the reported case: ص/ط are neighbouring emphatics");
  assert.equal(plausibleRecognitionConfusion(key("الصراط"), key("السراط")), true);
  assert.equal(plausibleRecognitionConfusion(key("الضالين"), key("الظالين")), true);
  // unrelated words are NOT plausible confusions
  assert.equal(plausibleRecognitionConfusion(key("الصراط"), key("المستقيم")), false);
  assert.equal(plausibleRecognitionConfusion(key("الرحمن"), key("نستعين")), false);
  assert.equal(plausibleRecognitionConfusion(key("إياك"), key("الضالين")), false);
  // …and plausibility never makes them equal
  for (const [a, b] of [["الصراط", "الطرق"], ["الضالين", "الظالين"]]) {
    assert.ok(weightedLetterDistance(key(a), key(b)) > 0);
    assert.equal(isSameWord(key(a), key(b)), false);
  }
});
