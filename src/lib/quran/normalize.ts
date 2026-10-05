/**
 * Arabic text normalization for recitation matching.
 *
 * The expected text is Uthmani script (full tashkeel, Quranic annotation
 * marks, dagger alef, small high letters, alef wasla…). Speech-to-text output
 * is plain modern orthography, usually without diacritics. We fold both to a
 * comparable "skeleton" — *only for comparison*. Displayed Quran text is never
 * altered.
 */

// Harakat, tanween, shadda, sukun, superscript alef (U+0670), Quranic marks.
const DIACRITICS =
  /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ࣓-ࣣ࣡-ࣿ]/g;
// Tatweel, ZW(N)J, RTL/LTR marks, end-of-ayah sign, rub el hizb, sajdah sign.
const NOISE = /[ـ‌‍‎‏؜۝۞۩]/g;
const PUNCT = /[،؛؟٪-٭۔.,;:!?"'()[\]{}«»\-–—_/\\*]/g;
const DIGITS = /[0-9٠-٩۰-۹]/g;

const LETTER_MAP: Record<string, string> = {
  "ٱ": "ا", // ٱ alef wasla
  "أ": "ا", // أ
  "إ": "ا", // إ
  "آ": "ا", // آ
  "ٲ": "ا",
  "ٳ": "ا",
  "ى": "ي", // ى alef maqsura
  "ی": "ي", // Farsi yeh
  "ة": "ه", // ة
  "ؤ": "و", // ؤ
  "ئ": "ي", // ئ
  "ک": "ك", // keheh
};

/** Fold to plain letters: no diacritics, unified alef/yeh/teh-marbuta forms. */
export function normalizeArabic(input: string): string {
  let s = input.normalize("NFC").replace(NOISE, "").replace(DIACRITICS, "");
  s = s.replace(/[ٱأإآٲٳىیةؤئک]/g, (c) => LETTER_MAP[c] ?? c);
  s = s.replace(/ء/g, ""); // standalone hamza is unreliable in STT output
  s = s.replace(PUNCT, " ").replace(DIGITS, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function tokenize(input: string): string[] {
  const n = normalizeArabic(input);
  return n ? n.split(" ") : [];
}

/**
 * Matching key: normalized word without alefs. Uthmani spelling drops or adds
 * alefs relative to modern orthography (الكتب / الكتاب, الصلوة / الصلاة), so
 * alefs carry little signal for "did the reciter say this word".
 */
export function matchKey(word: string): string {
  return normalizeArabic(word).replace(/ا/g, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similarity of two *keys* in 0..1. */
export function keySimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}
