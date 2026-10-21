/**
 * Direct answers to factual questions ABOUT a surah — how many ayahs, Meccan or Medinan, its order
 * in the Mushaf, the page it starts on — from the verified surah metadata. No retrieval and no model:
 * searching the tafsir for «كم عدد آيات سورة البقرة» only finds passages that happen to contain the
 * word «العدد», which is how wrong answers were produced.
 * Pure; no Quran text.
 */
import { ayahsLabel } from "@/lib/arabic";
import { pageForSurah } from "@/lib/quran/mushaf";
import { normalizeArabic } from "@/lib/quran/normalize";
import { getSurahMeta, revelationLabel, toArabicDigits } from "@/lib/quran/surahs";

export type SurahFactKind = "ayah-count" | "revelation" | "order" | "page";

export interface SurahFact {
  kind: SurahFactKind;
  surah: number;
  text: string;
}

const PATTERNS: [SurahFactKind, RegExp][] = [
  ["ayah-count", /(كم|عدد)\s+(عدد\s+)?(ايات|ايه|آيات)|عدد\s+(ايات|ايه)/],
  ["revelation", /(مكيه|مدنيه|مكي|مدني)|اين\s+نزلت|نزلت\s+في\s+مكه|نزلت\s+في\s+المدينه/],
  ["order", /(ترتيب|رقم)\s+(سوره|ال?سوره)|ترتيبها|ما\s+رقم|كم\s+رقم/],
  ["page", /(في\s+اي|اي|رقم)\s+صفحه|(تبدا|يبدا|تبدأ)\s+(في|من)\s+صفحه|صفحه\s+(بدايه|بدء)/],
];

/** The fact the question asks for about exactly one named surah, or null. */
export function surahFact(question: string, surahs: number[]): SurahFact | null {
  if (surahs.length !== 1) return null;
  const meta = getSurahMeta(surahs[0]);
  if (!meta) return null;
  const q = normalizeArabic(question);
  const name = `سورة ${meta.nameAr}`;
  for (const [kind, re] of PATTERNS) {
    if (!re.test(q)) continue;
    switch (kind) {
      case "ayah-count":
        return { kind, surah: meta.number, text: `عدد آيات ${name} ${ayahsLabel(meta.ayahCount)}.` };
      case "revelation":
        return { kind, surah: meta.number, text: `${name} ${revelationLabel(meta.revelation)}.` };
      case "order":
        return { kind, surah: meta.number, text: `${name} هي السورة رقم ${toArabicDigits(meta.number)} في ترتيب المصحف.` };
      case "page":
        return { kind, surah: meta.number, text: `تبدأ ${name} في الصفحة ${toArabicDigits(pageForSurah(meta.number))} من مصحف المدينة النبوية.` };
    }
  }
  return null;
}
