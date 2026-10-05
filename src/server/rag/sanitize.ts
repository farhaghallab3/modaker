/**
 * Post-processing for LLM output (pure, unit-tested). Enforces product rule 3:
 * the model must never be the source of Quran text. Whatever the prompt says,
 * we strip:
 *   1. anything inside ﴿ ﴾ (ornate parentheses used for verses)
 *   2. text carrying Quranic annotation marks / Uthmani-only letters
 *      (small high marks U+06D6–U+06ED, alef wasla U+0671, superscript alef U+0670)
 *   3. long quoted spans («…», "…", “…”) that look like verse quotations
 *   4. any run of ≥ 5 consecutive words that matches a known verified verse
 *      (the verses attached to the answer / in the retrieved context)
 * and replace each with a pointer to the attached verified text.
 */
import { normalizeArabic, tokenize } from "@/lib/quran/normalize";

export const VERSE_PLACEHOLDER = "(انظر نص الآية الموثّق المرفق)";

const ORNATE = /﴿[^﴾]*﴾?/g;
const QURANIC_MARKS = /[ٰٱۖ-ۭ]/;
const QUOTED = /«([^»]{0,800})»|"([^"]{0,800})"|“([^”]{0,800})”/g;
const LONG_QUOTE_WORDS = 4;
const HARAKAT = /[\u064B-\u0652]/g;
const ARABIC_LETTERS = /[\u0621-\u064A]/g;
/** Phrases that introduce a verse quotation. */
const VERSE_INTRO = /(تعالى|تعالي|قال الله|يقول الله|قوله|عز وجل|سبحانه)\s*[:،]?\s*$/;
const MATCH_RUN = 5;

export interface SanitizeOptions {
  /** Verified verse texts (Uthmani) that must not be reproduced by the model. */
  knownVerses?: string[];
}

export interface SanitizeResult {
  text: string;
  removed: number;
}

export function sanitizeLlmOutput(input: string, opts: SanitizeOptions = {}): SanitizeResult {
  let removed = 0;
  let text = input;

  text = text.replace(ORNATE, () => {
    removed++;
    return VERSE_PLACEHOLDER;
  });

  // Quoted spans that look like verses (see looksLikeVerse) are dropped.
  text = text.replace(QUOTED, (whole: string, a: string | undefined, b: string | undefined, c: string | undefined, offset: number, all: string) => {
    const inner = a ?? b ?? c ?? "";
    const before = all.slice(Math.max(0, offset - 30), offset);
    if (looksLikeVerse(inner, before)) {
      removed++;
      return VERSE_PLACEHOLDER;
    }
    return whole;
  });

  // Unquoted fragments written in Uthmani script: remove the sentence fragment.
  text = text
    .split(/(?<=[.!؟?،\n])/)
    .map((seg) => {
      if (QURANIC_MARKS.test(seg)) {
        removed++;
        return ` ${VERSE_PLACEHOLDER} `;
      }
      return seg;
    })
    .join("");

  if (opts.knownVerses?.length) {
    const r = removeVerseRuns(text, opts.knownVerses);
    text = r.text;
    removed += r.removed;
  }

  // Collapse repeated placeholders and whitespace.
  const ph = VERSE_PLACEHOLDER.replace(/[()]/g, "\\$&");
  text = text
    .replace(new RegExp(`(${ph}\\s*){2,}`, "g"), `${VERSE_PLACEHOLDER} `)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
  return { text, removed };
}

/**
 * A quoted span "looks like a verse" when it carries Quranic marks, is fully
 * vocalised (tashkeel on most letters), or is introduced like a verse
 * ("قال تعالى: «…»"). Plain unvocalised quotes (e.g. from tafsir) are kept.
 */
export function looksLikeVerse(inner: string, before = ""): boolean {
  if (QURANIC_MARKS.test(inner)) return true;
  const words = tokenize(inner).length;
  if (words < 2) return false;
  if (VERSE_INTRO.test(before)) return true;
  const letters = inner.match(ARABIC_LETTERS)?.length ?? 0;
  const marks = inner.match(HARAKAT)?.length ?? 0;
  return words >= LONG_QUOTE_WORDS && letters > 0 && marks / letters > 0.4;
}

/** Replace any ≥ MATCH_RUN-word run that appears verbatim (normalized) in a known verse. */
function removeVerseRuns(text: string, verses: string[]): SanitizeResult {
  const grams = new Set<string>();
  for (const v of verses) {
    const t = tokenize(v);
    for (let i = 0; i + MATCH_RUN <= t.length; i++) grams.add(t.slice(i, i + MATCH_RUN).join(" "));
  }
  if (!grams.size) return { text, removed: 0 };

  // Work on whitespace-separated words, keeping the original spelling.
  const parts = text.split(/(\s+)/);
  const wordIdx: number[] = [];
  const norm: string[] = [];
  parts.forEach((p, i) => {
    if (!/^\s+$/.test(p) && p) {
      wordIdx.push(i);
      norm.push(normalizeArabic(p));
    }
  });
  const kill = new Array(norm.length).fill(false);
  for (let i = 0; i + MATCH_RUN <= norm.length; i++) {
    if (grams.has(norm.slice(i, i + MATCH_RUN).join(" "))) for (let k = i; k < i + MATCH_RUN; k++) kill[k] = true;
  }
  if (!kill.some(Boolean)) return { text, removed: 0 };

  let removed = 0;
  let inRun = false;
  wordIdx.forEach((pi, wi) => {
    if (kill[wi]) {
      parts[pi] = inRun ? "" : VERSE_PLACEHOLDER;
      if (!inRun) removed++;
      inRun = true;
    } else inRun = false;
  });
  return { text: parts.join("").replace(/\s{2,}/g, " "), removed };
}

/** Extract the [n] citation markers the model used, in order of first use. */
export function usedCitationNumbers(text: string, max: number): number[] {
  const seen: number[] = [];
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) {
    const k = Number(m[1]);
    if (k >= 1 && k <= max && !seen.includes(k)) seen.push(k);
  }
  return seen;
}
