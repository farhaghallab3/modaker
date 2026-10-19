/**
 * Builds a Madinah Mushaf page (QCF V2 glyphs + line layout) from Quran.com and verifies it.
 * Line numbers come from the qdc API with mushaf=1 (QCF V2) — see API below.
 *
 * Layout: words carry their line number (1–15). Lines with no words are the surah header and
 * the basmala: when ayah 1 of a surah starts on line L, line L-1 is the basmala and L-2 the
 * header — except Al-Fatiha (the basmala is ayah 1) and At-Tawba (no basmala). When ayah 1 is
 * on line 1 or 2, the lines that don't fit are printed at the bottom of the PREVIOUS page, as in
 * the printed Mushaf: a page whose last verse ends its surah fills its trailing empty lines with
 * the next surah's header (and basmala).
 *
 * Integrity: for every verse on the page, the page's words (letters only — diacritics and mark
 * encodings differ between Quran.com's word and verse fields) must equal the verified provider's
 * text of that verse. Any mismatch → QuranVerificationError, and the page is not shown.
 */
import { normalizeArabic } from "@/lib/quran/normalize";
import { getSurahMeta } from "@/lib/quran/surahs";
import { MUSHAF_LINES, type MushafLine, type MushafPage, type MushafWord } from "@/lib/quran/mushaf";
import { QuranSourceUnavailableError, QuranVerificationError } from "../errors";
import { PromiseCache, type QuranProvider } from "./common";

/**
 * Quran.com's "qdc" API (the one quran.com itself renders pages from). Its line numbers match the
 * QCF V2 fonts; the public v4 `by_page` endpoint uses a different page/line layout on some pages
 * (e.g. page 585), which would misplace whole lines.
 */
const API = "https://api.qurancdn.com/api/qdc";
const FONT_BASE = "https://verses.quran.foundation/fonts/quran/hafs/v2/woff2";
const WEEK = 7 * 24 * 3600;

export const fontUrlFor = (page: number) => `${FONT_BASE}/p${page}.woff2`;

interface QcWord {
  position: number;
  char_type_name: string;
  code_v2: string;
  line_number: number;
  text_uthmani: string;
}
interface QcVerse {
  verse_key: string;
  verse_number: number;
  juz_number: number;
  words: QcWord[];
}

type Fetch = typeof fetch;

async function fetchPageVerses(page: number, fetchImpl: Fetch): Promise<QcVerse[]> {
  const verses: QcVerse[] = [];
  for (let part = 1; part <= 5; part++) {
    const url = `${API}/verses/by_page/${page}?words=true&word_fields=code_v2,line_number,text_uthmani&mushaf=1&per_page=all&page=${part}`;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { accept: "application/json" }, next: { revalidate: WEEK }, signal: AbortSignal.timeout(15_000) } as RequestInit);
    } catch (e) {
      throw new QuranSourceUnavailableError(`Quran.com unreachable: ${url}`, { cause: e });
    }
    if (!res.ok) throw new QuranSourceUnavailableError(`Quran.com ${res.status} for ${url}`);
    const data = (await res.json().catch(() => null)) as { verses?: QcVerse[]; pagination?: { next_page?: number | null } } | null;
    if (!Array.isArray(data?.verses)) throw new QuranSourceUnavailableError(`Quran.com: invalid page ${page}`);
    verses.push(...data.verses);
    if (!data.pagination?.next_page) break;
  }
  if (!verses.length) throw new QuranSourceUnavailableError(`Quran.com: no verses for page ${page}`);
  assertContinuous(page, verses);
  return verses;
}

/** No verse may be missing inside a page: consecutive ayahs, and surah changes go last ayah → 1. */
export function assertContinuous(page: number, verses: { verse_key: string }[]): void {
  const problems: string[] = [];
  for (let i = 1; i < verses.length; i++) {
    const [ps, pa] = verses[i - 1].verse_key.split(":").map(Number);
    const [s, a] = verses[i].verse_key.split(":").map(Number);
    const ok = s === ps ? a === pa + 1 : s === ps + 1 && a === 1 && pa === getSurahMeta(ps)?.ayahCount;
    if (!ok) problems.push(`${verses[i - 1].verse_key} → ${verses[i].verse_key}`);
  }
  if (problems.length) throw new QuranVerificationError(`Mushaf page ${page} has a gap`, problems);
}

function toWords(v: QcVerse, surah: number, ayah: number): MushafWord[] {
  return v.words
    .filter((w) => w.char_type_name === "word" || w.char_type_name === "end")
    .map((w) => ({
      id: `${surah}:${ayah}:${w.position}`,
      surah,
      ayah,
      position: w.position,
      type: w.char_type_name === "end" ? ("end" as const) : ("word" as const),
      glyph: w.code_v2,
      text: w.text_uthmani,
    }));
}

/** Pure layout step (exported for tests). */
export function layoutPage(page: number, verses: QcVerse[]): { lines: MushafLine[]; surahs: number[]; juz: number } {
  const byLine = new Map<number, MushafWord[]>();
  const headerLines = new Map<number, MushafLine>();
  const surahs: number[] = [];
  for (const v of verses) {
    const [surah, ayah] = v.verse_key.split(":").map(Number);
    if (!surahs.includes(surah)) surahs.push(surah);
    const words = toWords(v, surah, ayah);
    if (ayah === 1 && words.length) {
      const first = v.words[0].line_number; // lines < 1 belong to the previous page
      if (surah === 1) headerLines.set(first - 1, { n: first - 1, kind: "surah-header", surah });
      else if (surah === 9) headerLines.set(first - 1, { n: first - 1, kind: "surah-header", surah });
      else {
        headerLines.set(first - 1, { n: first - 1, kind: "basmala" });
        headerLines.set(first - 2, { n: first - 2, kind: "surah-header", surah });
      }
    }
    for (const w of words) {
      const n = v.words.find((x) => x.position === w.position)!.line_number;
      const list = byLine.get(n) ?? [];
      list.push(w);
      byLine.set(n, list);
    }
  }
  // The page's last verse ends its surah, and the next surah starts at the top of the next page:
  // its header (and basmala) go on this page's trailing empty lines.
  const lastVerse = verses[verses.length - 1];
  const [ls, la] = lastVerse.verse_key.split(":").map(Number);
  const lastWordLine = Math.max(...byLine.keys());
  if (page > 2 && ls < 114 && la === getSurahMeta(ls)?.ayahCount && lastWordLine < MUSHAF_LINES) {
    const next = ls + 1;
    const free = MUSHAF_LINES - lastWordLine;
    if (next === 9 || free === 1) headerLines.set(lastWordLine + 1, { n: lastWordLine + 1, kind: "surah-header", surah: next });
    else {
      headerLines.set(MUSHAF_LINES - 1, { n: MUSHAF_LINES - 1, kind: "surah-header", surah: next });
      headerLines.set(MUSHAF_LINES, { n: MUSHAF_LINES, kind: "basmala" });
    }
  }
  // Pages 1–2 are the centred opening pages: only their own lines (header, basmala, verses).
  const first = page <= 2 ? Math.min(...byLine.keys(), ...headerLines.keys()) : 1;
  const last = page <= 2 ? lastWordLine : MUSHAF_LINES;
  const lines: MushafLine[] = [];
  for (let n = first; n <= last; n++) {
    const words = byLine.get(n);
    if (words) lines.push({ n, kind: "words", words });
    else lines.push(headerLines.get(n) ?? { n, kind: "blank" });
  }
  return { lines, surahs, juz: verses[0].juz_number };
}

/**
 * Letters only, for comparison. Two harmless encoding differences between Quran.com's word-level
 * and verse-level text are folded: stray spaces inside a word (e.g. 5:52 «دَآئِرَةٌ») and alif written
 * as alif maqsura + dagger alif «ىٰ» (e.g. 11:13 «ٱفۡتَرَىٰهُ»). Any change to the letters still fails.
 */
const ALEF_MAQSURA_WITH_DAGGER = String.fromCharCode(0x0649, 0x0670);
const ALEF = String.fromCharCode(0x0627);

export function letterSkeleton(text: string): string {
  return normalizeArabic(text.replaceAll(ALEF_MAQSURA_WITH_DAGGER, ALEF)).replace(/\s+/g, "");
}

/** Throws QuranVerificationError when any verse's letters differ from the verified text. */
export async function verifyPage(verses: QcVerse[], quran: QuranProvider): Promise<void> {
  const problems: string[] = [];
  const bySurah = new Map<number, Map<number, string>>();
  for (const v of verses) {
    const [surah, ayah] = v.verse_key.split(":").map(Number);
    if (!bySurah.has(surah)) {
      const text = await quran.getSurah(surah);
      bySurah.set(surah, new Map(text.ayahs.map((a) => [a.ayah, a.textUthmani])));
    }
    const verified = bySurah.get(surah)!.get(ayah);
    const fromWords = v.words.filter((w) => w.char_type_name === "word").map((w) => w.text_uthmani).join(" ");
    if (verified == null) problems.push(`${v.verse_key}: not in verified text`);
    else if (letterSkeleton(fromWords) !== letterSkeleton(verified)) problems.push(`${v.verse_key}: letters differ from verified text`);
    if (v.words.some((w) => w.char_type_name === "word" && !w.code_v2)) problems.push(`${v.verse_key}: missing glyph`);
  }
  if (problems.length) throw new QuranVerificationError("Mushaf page failed verification", problems);
}

const cache = new PromiseCache<MushafPage>(700);
const basmalaCache = new PromiseCache<MushafWord[]>(1);

export function getMushafPage(page: number, quran: QuranProvider, fetchImpl: Fetch = fetch): Promise<MushafPage> {
  return cache.get(String(page), async () => {
    const verses = await fetchPageVerses(page, fetchImpl);
    await verifyPage(verses, quran);
    const { lines, surahs, juz } = layoutPage(page, verses);
    const needsBasmala = lines.some((l) => l.kind === "basmala");
    const basmala = needsBasmala
      ? {
          fontUrl: fontUrlFor(1),
          words: await basmalaCache.get("1:1", async () => {
            const p1 = await fetchPageVerses(1, fetchImpl);
            await verifyPage(p1.filter((v) => v.verse_key === "1:1"), quran);
            return toWords(p1.find((v) => v.verse_key === "1:1")!, 1, 1).filter((w) => w.type === "word");
          }),
        }
      : null;
    return {
      page,
      juz,
      surahs,
      lines,
      fontUrl: fontUrlFor(page),
      basmala,
      source: { id: "quran-com:qcf-v2", title: "مصحف المدينة النبوية — خطوط مجمع الملك فهد (عبر Quran.com)", url: `https://quran.com/page/${page}` },
    };
  });
}
