import { toArabicDigits } from "@/lib/quran/surahs";

/** Arabic-Indic digits for any number (rounded). */
export function n(x: number): string {
  return toArabicDigits(Math.round(x));
}

export function percent(ratio: number): string {
  return `${toArabicDigits(Math.round(ratio * 100))}٪`;
}

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("ar", { numeric: "auto" }) : null;

/** "منذ ٣ ساعات", "أمس", … */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (!rtf) return new Date(iso).toLocaleDateString("ar");
  if (abs < 60) return "الآن";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(iso);
}

export function formatDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }): string {
  return new Date(iso).toLocaleDateString("ar", opts);
}

/** Arabic plural-aware count for ayahs: "آية واحدة"، "آيتان"، "٣ آيات"، "١١ آية". */
export function ayahCount(k: number): string {
  if (k === 1) return "آية واحدة";
  if (k === 2) return "آيتان";
  if (k >= 3 && k <= 10) return `${n(k)} آيات`;
  return `${n(k)} آية`;
}

export function dayCount(k: number): string {
  if (k === 1) return "يوم واحد";
  if (k === 2) return "يومان";
  if (k >= 3 && k <= 10) return `${n(k)} أيام`;
  return `${n(k)} يومًا`;
}
