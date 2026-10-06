/**
 * Arabic display helpers for the memorization journey (counts, relative
 * dates, ranges). Pure — unit-tested in tests/journey.test.ts.
 */
import { toArabicDigits } from "@/lib/quran/surahs";
import type { SelfGrade } from "@/lib/types";
import type { SelfReviewOutcome } from "./self-review";

const DAY = 86_400_000;
const d = (n: number | string) => toArabicDigits(n);

function startOfDay(t: Date) {
  const x = new Date(t);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Whole calendar days from `now` to `date` (negative = past). */
export function daysFromNow(date: string | Date, now = new Date()): number {
  return Math.round((startOfDay(new Date(date)) - startOfDay(now)) / DAY);
}

/** Arabic count agreement for "آية". */
export function ayahCountLabel(n: number): string {
  if (n === 1) return "آية واحدة";
  if (n === 2) return "آيتان";
  if (n >= 3 && n <= 10) return `${d(n)} آيات`;
  return `${d(n)} آية`;
}

/** REVIEW STATE wording: "آية تحتاج مراجعة" / "آيتان تحتاجان مراجعة" / "٣ آيات تحتاج مراجعة". */
export function needsReviewLabel(n: number): string {
  if (n === 1) return "آية تحتاج مراجعة";
  if (n === 2) return "آيتان تحتاجان مراجعة";
  if (n >= 3 && n <= 10) return `${d(n)} آيات تحتاج مراجعة`;
  return `${d(n)} آية تحتاج مراجعة`;
}

/** Bare noun form after a number ("٣ آيات" / "١٢ آية"), number shown separately. */
export function ayahNoun(n: number): string {
  return n >= 3 && n <= 10 ? "آيات" : "آية";
}

function daysPhrase(n: number): string {
  if (n === 1) return "يوم";
  if (n === 2) return "يومين";
  if (n <= 10) return `${d(n)} أيام`;
  return `${d(n)} يومًا`;
}

/** "اليوم" / "غدًا" / "بعد ٣ أيام" / "متأخرة يومين". */
export function relativeDueLabel(date: string | Date, now = new Date()): string {
  const n = daysFromNow(date, now);
  if (n === 0) return "اليوم";
  if (n === 1) return "غدًا";
  if (n === -1) return "منذ الأمس";
  if (n < 0) return `متأخرة ${daysPhrase(-n)}`;
  if (n < 30) return `بعد ${daysPhrase(n)}`;
  const months = Math.round(n / 30);
  return months === 1 ? "بعد شهر" : months === 2 ? "بعد شهرين" : `بعد ${d(months)} أشهر`;
}

export function percentLabel(ratio: number): string {
  return `${d(Math.round(Math.max(0, Math.min(1, ratio)) * 100))}٪`;
}

/** "الآية ٥" or "الآيات ٥–٩". */
export function rangeLabel(from: number, to: number): string {
  return from === to ? `الآية ${d(from)}` : `الآيات ${d(from)}–${d(to)}`;
}

/** Memorized ranges as text: "الآية ١" · "الآيات ١، ٣–٤". */
export function rangesLabel(ranges: { from: number; to: number }[]): string {
  const parts = ranges.map((r) => (r.from === r.to ? d(r.from) : `${d(r.from)}–${d(r.to)}`));
  return `${ranges.length === 1 && ranges[0].from === ranges[0].to ? "الآية" : "الآيات"} ${parts.join("، ")}`;
}

/** "٠٣:٢٤" */
export function clockLabel(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return d(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
}

// ── Self-assessed review (Arabic-first; no technical vocabulary) ─────────────────────────────

export const SELF_GRADES: { grade: SelfGrade; label: string; hint: string }[] = [
  { grade: "solid", label: "ثبتت", hint: "تذكّرتها بثقة" },
  { grade: "hesitated", label: "ترددت", hint: "تذكّرتها لكن بعد تردّد أو جهد" },
  { grade: "forgot", label: "نسيت", hint: "لم أستطع تذكّرها" },
];

export const SELF_GRADE_LABEL: Record<SelfGrade, string> = { solid: "ثبتت", hesitated: "ترددت", forgot: "نسيت" };

/** The sentence shown after a self-assessment. `nextDue` is the earliest next review date among the range. */
export function selfReviewMessage(grade: SelfGrade, counts: Record<SelfReviewOutcome, number>, nextDue: string | null, now = new Date(), stillNeedsRecitation = 0): string {
  const applied = counts.credited + counts.downgraded;
  if (!applied) {
    if (counts["same-day"]) return "قيّمت هذه الآيات اليوم، فلا يُحتسب تقييم مكرّر. يمكنك تغيير التقييم إلى تقييم أدنى فقط.";
    if (counts["recitation-today"]) return "حُسمت مراجعة هذه الآيات بتسميعك اليوم، فلا حاجة لتقييم ذاتي.";
    if (counts["not-due"]) return "سجّلنا تقييمك، ولم يتغيّر موعد المراجعة لأن موعدها لم يحن بعد.";
    return "لا توجد آيات محفوظة هنا لتقييمها.";
  }
  const when = nextDue ? relativeDueLabel(nextDue, now) : "";
  // Some of these ayahs carry a confirmed recitation difference: a self-assessment does not clear it.
  if (stillNeedsRecitation && grade === "solid") return "سجّلنا مراجعتك اليوم، لكن بعض هذه الآيات ما زالت تحتاج إلى تسميع ناجح لتثبيتها، ولم يتغيّر موعد مراجعتها.";
  if (stillNeedsRecitation && grade === "hesitated") return `سجّلنا تقييمك، وبعض هذه الآيات ما زالت تحتاج إلى تسميع ناجح لتثبيتها. موعدها: ${when}.`;
  if (grade === "solid") return `بارك الله فيك. موعد مراجعتك القادمة: ${when}.`;
  if (grade === "hesitated") return `لا بأس. قرّبنا موعد المراجعة لتثبيتها: ${when}.`;
  return "لا بأس، الحفظ يثبت بالتكرار. اقرأ الآيات الآن ثم عُد لتسمّعها؛ سنذكّرك بها غدًا.";
}

/** "آخر تقييم: ذاتي — ثبتت" — a self-assessment is never described as verified. */
export function lastSelfLabel(grade: SelfGrade): string {
  return `آخر تقييم: ذاتي — ${SELF_GRADE_LABEL[grade]}`;
}

/** "آخر تسميع مؤكّد: ٣ أكتوبر" — only for recitations the app could actually judge. */
export function lastRecitationLabel(at: string | Date): string {
  const date = toArabicDigits(new Date(at).toLocaleDateString("ar", { day: "numeric", month: "long" }));
  return `آخر تسميع مؤكّد: ${date}`;
}
