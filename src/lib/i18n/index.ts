/**
 * Localization scaffold. Arabic ships first; English is wired structurally
 * (direction, number formatting, dictionary keys) so screens can migrate to
 * `t()` incrementally without layout changes — every layout uses logical
 * properties (start/end, ps/pe, ms/me), never left/right.
 */
import { ar } from "./ar";
import { en } from "./en";

export type Locale = "ar" | "en";
export const DEFAULT_LOCALE: Locale = "ar";

export const localeConfig: Record<Locale, { lang: string; dir: "rtl" | "ltr"; numberLocale: string }> = {
  ar: { lang: "ar", dir: "rtl", numberLocale: "ar-EG" },
  en: { lang: "en", dir: "ltr", numberLocale: "en-US" },
};

export type Dictionary = typeof ar;
const dictionaries: Record<Locale, Dictionary> = { ar, en };

type Path<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Path<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Path<Dictionary>;

export function t(key: MessageKey, locale: Locale = DEFAULT_LOCALE): string {
  const parts = key.split(".");
  let cur: unknown = dictionaries[locale];
  for (const p of parts) cur = (cur as Record<string, unknown>)?.[p];
  return typeof cur === "string" ? cur : key;
}

export function formatNumber(n: number, locale: Locale = DEFAULT_LOCALE) {
  return new Intl.NumberFormat(localeConfig[locale].numberLocale).format(n);
}

export function formatPercent(ratio: number, locale: Locale = DEFAULT_LOCALE) {
  return new Intl.NumberFormat(localeConfig[locale].numberLocale, { style: "percent", maximumFractionDigits: 0 }).format(ratio);
}
