/**
 * Memorization quiz built ONLY from verified verses (pure). Each question
 * shows the opening words of an ayah — sliced from the provider's text, never
 * typed or generated — and the full verses are attached for answer reveal.
 */
import { tokenize } from "@/lib/quran/normalize";
import { toArabicDigits } from "@/lib/quran/surahs";
import type { Ayah, SurahMeta } from "@/lib/types";

export interface Quiz {
  text: string;
  verses: Ayah[];
}

/** Display words, skipping standalone annotation marks (as compare.ts does). */
export function displayWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => tokenize(w).length > 0);
}

export function openingWords(ayah: Ayah, n = 3): string {
  const words = displayWords(ayah.textUthmani);
  const take = Math.min(n, Math.max(1, words.length - 2)); // always leave something to recite
  return words.slice(0, take).join(" ");
}

/** Deterministic PRNG for tests (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildQuiz(meta: SurahMeta, candidates: Ayah[], count = 3, random: () => number = Math.random): Quiz | null {
  // Prefer ayahs long enough that the prompt doesn't give the answer away.
  let pool = candidates.filter((a) => displayWords(a.textUthmani).length >= 5);
  if (pool.length < count) pool = candidates.filter((a) => displayWords(a.textUthmani).length >= 3);
  if (!pool.length) return null;

  const picked: Ayah[] = [];
  const bag = [...pool];
  while (picked.length < count && bag.length) {
    picked.push(bag.splice(Math.floor(random() * bag.length), 1)[0]);
  }
  picked.sort((a, b) => a.ayah - b.ayah);

  const lines = picked.map((a, i) => `${toArabicDigits(i + 1)}. (الآية ${toArabicDigits(a.ayah)}) أكمل: «${openingWords(a)} …»`);
  const text = [
    `اختبار تسميع من سورة ${meta.nameAr} 🌿`,
    "اقرأ بداية كل آية، ثم أكملها من حفظك (بصوتك أو في ذهنك)، وبعدها اضغط «إظهار الإجابة» لتقارن بالنص الموثّق المرفق.",
    "",
    ...lines,
  ].join("\n");
  return { text, verses: picked };
}
