/**
 * What the teacher says after a recitation (spoken with the AI voice and shown as text).
 * Fixed sentences built from the result only: ayah NUMBERS and counts, never Quran words,
 * so the AI voice never "recites" anything.
 */
import { toArabicDigits } from "@/lib/quran/surahs";
import type { RecitationAnalysis } from "@/lib/types";

/** Ayahs the learner should listen to and recite again (confirmed differences only). */
export function ayahsToRepeat(a: Pick<RecitationAnalysis, "ayahs" | "recognition">): number[] {
  if (a.recognition !== "good") return [];
  return a.ayahs.filter((x) => x.status === "needs-review" || x.status === "missed").map((x) => x.ayah);
}

/** Ayahs where only the recognizer was unsure (nothing counted against the learner). */
export function ayahsUnsure(a: Pick<RecitationAnalysis, "ayahs" | "recognition">): number[] {
  if (a.recognition !== "good") return [];
  return a.ayahs.filter((x) => x.status === "uncertain").map((x) => x.ayah);
}

function ayahList(nums: number[]): string {
  const shown = nums.slice(0, 5).map((n) => toArabicDigits(n));
  const more = nums.length > 5 ? ` وغيرها` : "";
  if (shown.length === 1) return `الآية ${shown[0]}`;
  return `الآيات ${shown.slice(0, -1).join(" و")} و${shown[shown.length - 1]}${more}`;
}

export function recitationFeedbackText(a: Pick<RecitationAnalysis, "ayahs" | "recognition">): string {
  if (a.recognition !== "good") {
    return "لم أسمع تلاوتك بوضوح كافٍ. اقترب من الميكروفون، واختر مكانًا هادئًا، ثم أعد التسميع مرة أخرى.";
  }
  const repeat = ayahsToRepeat(a);
  const unsure = ayahsUnsure(a);
  if (!repeat.length && !unsure.length) {
    return "ما شاء الله، أحسنت! تلاوتك مطابقة للمصحف. ثبّتك الله، ويمكنك الانتقال إلى المقطع التالي.";
  }
  if (!repeat.length) {
    return `أحسنت. لم أتأكد من بعض الكلمات في ${ayahList(unsure)}، فلم أحتسبها عليك. أعدها بصوت أوضح لنتأكد معًا.`;
  }
  const opener = repeat.length * 2 <= a.ayahs.length ? "أحسنت، تلاوتك جيدة." : "بداية طيبة، والحفظ يثبت بالتكرار.";
  return `${opener} راجع ${ayahList(repeat)}؛ فيها كلمات تحتاج انتباهًا، وهي مظلّلة أمامك. استمع إلى الشيخ، ثم أعد المحاولة.`;
}
