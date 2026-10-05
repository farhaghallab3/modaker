/**
 * Acoustic-confusion plausibility — the LAST-RESORT evidence that a mismatch may be a recognition
 * slip rather than the learner's mistake.
 *
 * This is a HEURISTIC about spelling/sound, not a confidence measure: it says "the recognized word
 * is the kind of thing a speech recognizer writes when it half-hears the expected word" (e.g.
 * «الصراط» → «الطرق»: ص/ط are neighbouring emphatic consonants, ر and the definite article match). It
 * is consulted only when the recognizer supplied no better evidence, and it NEVER makes two different
 * words equal — a word that is "plausibly confused" is reported as UNCERTAIN, not as correct.
 *
 * Works on match keys (diacritics folded, alef-free — see matchKey()).
 */

/** Letter pairs that sound close enough to be confused by recognizers and listeners. Symmetric. */
const CONFUSABLE_PAIRS = [
  "صس", "صث", "صض", "صط", "صز", "سث", "سز", // sibilants / emphatics
  "طت", "طد", "طض", "تد", "تث", "ضد", "ضظ", "ظذ", "ظز", "ذز", "ذد", "ذث", // dental / emphatic stops
  "قك", "قغ", "قخ", "غخ", "كغ", // back consonants
  "حه", "حخ", // pharyngeals
  "نم", // nasals
  "رل", "رغ", // liquids
];
const CONFUSABLE = new Set(CONFUSABLE_PAIRS.flatMap((p) => [p, p[1] + p[0]]));

/** Are these two (different) letters an acoustically confusable pair? */
export function isConfusablePair(x: string, y: string): boolean {
  return x !== y && CONFUSABLE.has(x + y);
}

/** Letters that are easily dropped or inserted in recognition. */
const WEAK = new Set(["و", "ي", "ه", "ن", "ع"]);

const SUB_CONFUSABLE = 0.4;
const SUB_OTHER = 1;
const INDEL_WEAK = 0.6;
const INDEL_OTHER = 1;

/** Weighted edit distance between two keys: cheap for confusable letters / weak letters, full price otherwise. */
export function weightedLetterDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) d[i][0] = d[i - 1][0] + (WEAK.has(a[i - 1]) ? INDEL_WEAK : INDEL_OTHER);
  for (let j = 1; j <= n; j++) d[0][j] = d[0][j - 1] + (WEAK.has(b[j - 1]) ? INDEL_WEAK : INDEL_OTHER);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const x = a[i - 1];
      const y = b[j - 1];
      const sub = x === y ? 0 : CONFUSABLE.has(x + y) ? SUB_CONFUSABLE : SUB_OTHER;
      d[i][j] = Math.min(
        d[i - 1][j - 1] + sub,
        d[i - 1][j] + (WEAK.has(x) ? INDEL_WEAK : INDEL_OTHER),
        d[i][j - 1] + (WEAK.has(y) ? INDEL_WEAK : INDEL_OTHER),
      );
    }
  }
  return d[m][n];
}

/** Normalised distance must be small AND the absolute distance modest, so unrelated words never qualify. */
export const CONFUSION_MAX_NORMALISED = 0.4;
export const CONFUSION_MAX_ABSOLUTE = 1.8;

export function plausibleRecognitionConfusion(expectedKey: string, heardKey: string): boolean {
  if (!expectedKey || !heardKey || expectedKey === heardKey) return false;
  const dist = weightedLetterDistance(expectedKey, heardKey);
  return dist <= CONFUSION_MAX_ABSOLUTE && dist / Math.max(expectedKey.length, heardKey.length) <= CONFUSION_MAX_NORMALISED;
}
