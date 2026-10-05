/**
 * Shared pieces for Quran providers (kept separate from provider.ts to avoid
 * import cycles between the factory and the implementations).
 */
import { ayahAudioKey, getSurahMeta } from "@/lib/quran/surahs";
import type { Ayah, AyahRange, SurahText, TafsirEntry } from "@/lib/types";
import { env } from "../env";
import { apiError } from "../errors";
import type { TafsirSlug } from "../rag/sources";

export type { TafsirSlug };

export interface QuranProvider {
  /** "quran-com" | "database" | "json" */
  readonly id: string;
  getSurah(n: number): Promise<SurahText>;
  getAyahs(range: AyahRange): Promise<Ayah[]>;
  getTafsir(n: number, source: TafsirSlug): Promise<TafsirEntry[]>;
}

export const MAX_SURAH = 114;

/** Validate a surah number; throws a 404-style ApiError. */
export function assertSurah(n: number) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_SURAH) {
    throw apiError(404, "not_found", "رقم السورة غير صحيح (من ١ إلى ١١٤).");
  }
}

/** Validate a range against metadata; throws 400 on nonsense input. */
export function assertRange(range: AyahRange) {
  assertSurah(range.surah);
  const meta = getSurahMeta(range.surah)!;
  if (
    !Number.isInteger(range.from) ||
    !Number.isInteger(range.to) ||
    range.from < 1 ||
    range.to < range.from ||
    range.to > meta.ayahCount
  ) {
    throw apiError(400, "invalid_request", `نطاق الآيات غير صحيح لسورة ${meta.nameAr} (١–${meta.ayahCount}).`);
  }
}

export function sliceRange(text: SurahText, range: AyahRange): Ayah[] {
  assertRange(range);
  return text.ayahs.slice(range.from - 1, range.to);
}

export function audioUrlFor(surah: number, ayah: number): string {
  return `${env.ayahAudioBase()}/${ayahAudioKey(surah, ayah)}.mp3`;
}

/** Strip HTML tags/entities from tafsir text returned by APIs. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Small promise cache: dedupes concurrent requests and keeps results for the
 * process lifetime (Quran text is immutable). Failed loads are not cached.
 */
export class PromiseCache<T> {
  private map = new Map<string, Promise<T>>();
  constructor(private maxEntries = 500) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.map.get(key);
    if (hit) return hit;
    const p = load().catch((e) => {
      this.map.delete(key);
      throw e;
    });
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, p);
    return p;
  }

  clear() {
    this.map.clear();
  }
}
