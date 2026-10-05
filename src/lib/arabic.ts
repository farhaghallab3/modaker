/**
 * Small Arabic display helpers: counted nouns, times and percentages.
 * Display only — never used for Quran text.
 */
import { toArabicDigits } from "@/lib/quran/surahs";

type Forms = { one: string; two: string; few: string; many: string };

/** Arabic counted noun: 1 → "آية واحدة", 2 → "آيتان", 3–10 → "٣ آيات", 11+ → "١١ آية". */
export function countLabel(n: number, f: Forms): string {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  const r = n % 100;
  const noun = r >= 3 && r <= 10 ? f.few : f.many;
  return `${toArabicDigits(n)} ${noun}`;
}

export const ayahsLabel = (n: number) => countLabel(n, { one: "آية واحدة", two: "آيتان", few: "آيات", many: "آية" });
export const daysLabel = (n: number) => countLabel(n, { one: "يوم واحد", two: "يومان", few: "أيام", many: "يومًا" });
export const sessionsLabel = (n: number) => countLabel(n, { one: "جلسة واحدة", two: "جلستان", few: "جلسات", many: "جلسة" });

/** "05:30" → "٥:٣٠ ص" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${toArabicDigits(h12)}:${toArabicDigits(String(m).padStart(2, "0"))} ${period}`;
}

/** 0.943 → "٩٤٪" */
export function formatPercent(v: number): string {
  return `${toArabicDigits(Math.round(v * 100))}٪`;
}

/** "الآيات ٣٢–٣٦" or "الآية ٣٢" */
export function rangeLabel(from: number, to: number): string {
  return from === to ? `الآية ${toArabicDigits(from)}` : `الآيات ${toArabicDigits(from)}–${toArabicDigits(to)}`;
}
