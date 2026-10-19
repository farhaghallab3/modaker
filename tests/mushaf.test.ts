/**
 * Mushaf page layout + verification (pure parts of src/server/quran/mushaf.ts).
 * Synthetic words only — no Quran text in the repository.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getSurahMeta } from "../src/lib/quran/surahs";
import { pageForSurah, surahAtPage } from "../src/lib/quran/mushaf";
import { assertContinuous, layoutPage, letterSkeleton, verifyPage } from "../src/server/quran/mushaf";
import { QuranVerificationError } from "../src/server/errors";
import { FakeQuran, fakeAyahText } from "./_fixtures";

/** A verse whose words sit on the given lines (one word per line entry), plus an end marker. */
function verse(surah: number, ayah: number, lines: number[], text = fakeAyahText(surah, ayah)) {
  const words = text.split(" ");
  return {
    verse_key: `${surah}:${ayah}`,
    verse_number: ayah,
    juz_number: 1,
    words: [
      ...lines.map((line, i) => ({ position: i + 1, char_type_name: "word", code_v2: `g${i}`, line_number: line, text_uthmani: words[i] ?? "" })),
      { position: lines.length + 1, char_type_name: "end", code_v2: "e", line_number: lines[lines.length - 1], text_uthmani: "" },
    ],
  };
}

const kinds = (page: ReturnType<typeof layoutPage>) => page.lines.map((l) => (l.kind === "words" ? "w" : l.kind === "surah-header" ? `H${l.surah}` : l.kind === "basmala" ? "B" : "_"));

test("a surah starting mid-page gets its header and basmala on the two lines above", () => {
  const last = getSurahMeta(66)!.ayahCount;
  const page = layoutPage(560, [verse(66, last, [1, 2]), verse(67, 1, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])]);
  assert.deepEqual(kinds(page), ["w", "w", "H67", "B", "w", "w", "w", "w", "w", "w", "w", "w", "w", "w", "w"]);
  assert.deepEqual(page.surahs, [66, 67]);
});

test("At-Tawba has a header but no basmala", () => {
  const page = layoutPage(187, [verse(9, 1, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])]);
  assert.deepEqual(kinds(page).slice(0, 2), ["H9", "w"]);
});

test("when ayah 1 is at the top of a page, the header goes to the bottom of the previous page", () => {
  const last = getSurahMeta(32)!.ayahCount;
  // previous page: its last verse ends the surah on line 14 → line 15 is the next surah's header
  const prev = layoutPage(417, [verse(32, last, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])]);
  assert.equal(kinds(prev)[14], "H33");
  // next page: ayah 1 on line 2 → line 1 is the basmala, no header here
  const next = layoutPage(418, [verse(33, 1, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])]);
  assert.deepEqual(kinds(next).slice(0, 2), ["B", "w"]);
  // two free lines at the bottom → header + basmala, and the next page starts with ayah 1 on line 1
  const prev2 = layoutPage(500, [verse(32, last, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])]);
  assert.deepEqual(kinds(prev2).slice(13), ["H33", "B"]);
});

test("the opening pages use only their own lines", () => {
  const page = layoutPage(1, [verse(1, 1, [9]), verse(1, 2, [10, 11])]);
  assert.deepEqual(kinds(page), ["H1", "w", "w", "w"]);
});

test("no verse may be missing inside a page", () => {
  assert.doesNotThrow(() => assertContinuous(10, [{ verse_key: "2:5" }, { verse_key: "2:6" }]));
  const last = getSurahMeta(54)!.ayahCount;
  assert.doesNotThrow(() => assertContinuous(531, [{ verse_key: `54:${last}` }, { verse_key: "55:1" }]));
  assert.throws(() => assertContinuous(10, [{ verse_key: "2:5" }, { verse_key: "2:7" }]), QuranVerificationError);
  assert.throws(() => assertContinuous(10, [{ verse_key: "54:3" }, { verse_key: "55:1" }]), QuranVerificationError, "surah ended early");
});

test("letter comparison ignores encoding variants but not letter changes", () => {
  const ALEF_MAQSURA_DAGGER = String.fromCharCode(0x0649, 0x0670);
  assert.equal(letterSkeleton(`سم${ALEF_MAQSURA_DAGGER}ه`), letterSkeleton("سماه"), "ىٰ and ا are the same letter");
  assert.equal(letterSkeleton("الكتا ب"), letterSkeleton("الكتاب"), "a stray space inside a word");
  assert.notEqual(letterSkeleton("الكتاب"), letterSkeleton("الكاتب"), "a real letter change is caught");
});

test("a page whose words differ from the verified text is refused", async () => {
  const quran = new FakeQuran();
  const good = verse(112, 1, [1, 1, 1, 1, 1, 1, 1, 1]);
  await assert.doesNotReject(verifyPage([good], quran));
  const tampered = verse(112, 1, [1, 1, 1, 1, 1, 1, 1, 1], `${fakeAyahText(112, 1)} زائد`.split(" ").slice(1).join(" "));
  await assert.rejects(verifyPage([tampered], quran), QuranVerificationError);
});

test("surah ↔ page lookups", () => {
  assert.equal(pageForSurah(1), 1);
  assert.equal(pageForSurah(2), 2);
  assert.equal(pageForSurah(67), 562);
  assert.equal(surahAtPage(562), 67);
  assert.equal(surahAtPage(604), 114);
});
