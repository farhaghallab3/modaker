/**
 * The Madinah Mushaf page layout (604 pages, 15 lines), rendered with the King Fahd Complex
 * page fonts (QCF V2): each word is one glyph in that page's font, so a page looks exactly like
 * the printed copy. Glyph codes and line numbers come from Quran.com with the verified text; the
 * server checks every verse against the verified Quran provider before a page is served.
 */

export const MUSHAF_PAGES = 604;
export const MUSHAF_LINES = 15;

export interface MushafWord {
  /** "2:255:3" — surah:ayah:position */
  id: string;
  surah: number;
  ayah: number;
  position: number;
  /** "word", or "end" for the ayah-number marker. */
  type: "word" | "end";
  /** Glyph code in this page's QCF V2 font. */
  glyph: string;
  /** Plain Uthmani text of the word (for screen readers, copy and the word panel). */
  text: string;
}

export type MushafLine =
  | { n: number; kind: "words"; words: MushafWord[] }
  | { n: number; kind: "surah-header"; surah: number }
  | { n: number; kind: "basmala" }
  | { n: number; kind: "blank" };

export interface MushafPage {
  page: number;
  juz: number;
  /** Surahs that appear on this page, in order. */
  surahs: number[];
  lines: MushafLine[];
  /** QCF V2 font for this page. */
  fontUrl: string;
  /** The basmala as words of 1:1, in page 1's font (used on header pages). */
  basmala: { fontUrl: string; words: MushafWord[] } | null;
  source: { id: string; title: string; url: string };
}

/** First Mushaf page of each surah (index 0 = surah 1), from Quran.com's chapter data. */
export const SURAH_START_PAGE: readonly number[] = [
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312, 322, 332, 342, 350, 359, 367, 377,
  385, 396, 404, 411, 415, 418, 428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507, 511, 515, 518, 520, 523, 526,
  528, 531, 534, 537, 542, 545, 549, 551, 553, 554, 556, 558, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583,
  585, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596, 596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601,
  602, 602, 602, 603, 603, 603, 604, 604, 604,
];

export function pageForSurah(surah: number): number {
  return SURAH_START_PAGE[surah - 1] ?? 1;
}

/** The surah being read at the top of a page (the last surah that started on or before it). */
export function surahAtPage(page: number): number {
  let s = 1;
  for (let i = 0; i < SURAH_START_PAGE.length; i++) if (SURAH_START_PAGE[i] <= page) s = i + 1;
  return s;
}

export function isValidPage(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MUSHAF_PAGES;
}

export const qcfFontFamily = (page: number) => `qcf-v2-p${page}`;
