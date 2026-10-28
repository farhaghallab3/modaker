/**
 * What the teacher says after a recitation.
 *  - `text` is shown on screen and may name ayah NUMBERS.
 *  - `key` picks one of a few FIXED spoken sentences (TEACHER_PHRASES). They never change, so their audio is prepared
 *    while the learner is still reciting and plays the moment the result arrives.
 * Never Quran words: the AI voice never "recites" anything.
 */
import { toArabicDigits } from "@/lib/quran/surahs";
import type { RecitationAnalysis } from "@/lib/types";

export type TeacherPhraseKey = "perfect" | "repeat" | "incomplete" | "unsure" | "unheard";

export const TEACHER_PHRASES: Record<TeacherPhraseKey, string> = {
  perfect: "ما شاء الله، أحسنت! تلاوتك صحيحة.",
  repeat: "أحسنت المحاولة. بعض الكلمات تحتاج مراجعة، وهي مظلّلة أمامك. استمع إلى الشيخ، ثم أعد المحاولة.",
  incomplete: "أحسنت فيما قرأت. لم أسمع بقية المقطع، فأكمل التسميع.",
  unsure: "لم أتأكد من بعض الكلمات. أعد الجزء المظلّل بصوت أوضح.",
  unheard: "لم أسمعك بوضوح. اقترب من الميكروفون، ثم أعد المحاولة.",
};

type Input = Pick<RecitationAnalysis, "ayahs" | "recognition">;

/** Ayahs the learner should listen to and recite again (confirmed differences only). */
export function ayahsToRepeat(a: Input): number[] {
  if (a.recognition !== "good") return [];
  return a.ayahs.filter((x) => x.status === "needs-review" || x.status === "missed").map((x) => x.ayah);
}

/** Ayahs where not a single word was heard: the learner most likely stopped before them. */
export function ayahsNotRecited(a: Input): number[] {
  if (a.recognition !== "good") return [];
  return a.ayahs.filter((x) => x.status === "uncertain" && x.words.every((w) => w.state !== "ok" && !w.heard)).map((x) => x.ayah);
}

/** Ayahs where only the recognizer was unsure about some words (nothing counted against the learner). */
export function ayahsUnsure(a: Input): number[] {
  const skipped = new Set(ayahsNotRecited(a));
  if (a.recognition !== "good") return [];
  return a.ayahs.filter((x) => x.status === "uncertain" && !skipped.has(x.ayah)).map((x) => x.ayah);
}

/** "الآية ٣" / "الآيتين ٤ و٥" / "الآيات ٢ و٣ و٤" (genitive, as used after a verb or preposition). */
export function ayahNumbers(nums: number[]): string {
  const shown = nums.slice(0, 5).map((n) => toArabicDigits(n));
  const more = nums.length > 5 ? " وغيرها" : "";
  if (shown.length === 1) return `الآية ${shown[0]}`;
  const list = `${shown.slice(0, -1).join(" و")} و${shown[shown.length - 1]}`;
  return `${shown.length === 2 ? "الآيتين" : "الآيات"} ${list}${more}`;
}

export function teacherFeedback(a: Input): { key: TeacherPhraseKey; text: string } {
  if (a.recognition !== "good") return { key: "unheard", text: TEACHER_PHRASES.unheard };
  const repeat = ayahsToRepeat(a);
  const skipped = ayahsNotRecited(a);
  const unsure = ayahsUnsure(a);
  if (repeat.length) {
    const rest = skipped.length ? ` ولم أسمع ${ayahNumbers(skipped)}.` : "";
    return { key: "repeat", text: `أحسنت المحاولة. راجع ${ayahNumbers(repeat)}، ثم استمع إلى الشيخ وأعد المحاولة.${rest}` };
  }
  if (skipped.length) return { key: "incomplete", text: `أحسنت فيما قرأت. لم أسمع ${ayahNumbers(skipped)}، فأكمل التسميع.` };
  if (unsure.length) return { key: "unsure", text: `لم أتأكد من بعض الكلمات في ${ayahNumbers(unsure)}. أعدها بصوت أوضح.` };
  return { key: "perfect", text: TEACHER_PHRASES.perfect };
}

/** Kept for callers that only need the sentence shown on screen. */
export function recitationFeedbackText(a: Input): string {
  return teacherFeedback(a).text;
}
