/**
 * Quran.com API v4 provider (vendor-specific code lives only here).
 *
 *   verses: GET /verses/by_chapter/{n}?fields=text_uthmani,page_number,juz_number&per_page=50&page=k
 *   tafsir: GET /tafsirs/{id}/by_chapter/{n}?per_page=50&page=k
 *
 * Responses are cached twice: Next's data cache (revalidate weekly) and an
 * in-memory promise cache per process. Every surah is verified before use.
 */
import { getSurahMeta } from "@/lib/quran/surahs";
import type { Ayah, AyahRange, SurahText, TafsirEntry } from "@/lib/types";
import { env } from "../env";
import { QuranSourceUnavailableError } from "../errors";
import { KNOWLEDGE_SOURCES, sourceRef, TAFSIR_SOURCE_IDS, type TafsirSlug } from "../rag/sources";
import { PromiseCache, assertSurah, audioUrlFor, sliceRange, stripHtml, type QuranProvider } from "./common";
import { assertVerified } from "./verification";

const WEEK = 604_800;
const PER_PAGE = 50;
const MAX_PAGES = 20; // 286 ayahs / 50 = 6 pages; guards against a broken `next_page` loop

interface QcVerse {
  verse_number: number;
  verse_key: string;
  text_uthmani?: string;
  page_number?: number;
  juz_number?: number;
}
interface QcTafsir {
  verse_key: string;
  text: string;
}
interface QcPagination {
  next_page: number | null;
}

type FetchLike = (url: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

export class QuranComProvider implements QuranProvider {
  readonly id = "quran-com";
  private surahs = new PromiseCache<SurahText>(120);
  private tafsir = new PromiseCache<TafsirEntry[]>(240);

  constructor(
    private base = env.quranComApi(),
    private fetchImpl: FetchLike = fetch as FetchLike,
  ) {}

  getSurah(n: number): Promise<SurahText> {
    assertSurah(n);
    return this.surahs.get(String(n), () => this.loadSurah(n));
  }

  async getAyahs(range: AyahRange): Promise<Ayah[]> {
    return sliceRange(await this.getSurah(range.surah), range);
  }

  getTafsir(n: number, source: TafsirSlug): Promise<TafsirEntry[]> {
    assertSurah(n);
    return this.tafsir.get(`${source}:${n}`, () => this.loadTafsir(n, source));
  }

  // ── internals ────────────────────────────────────────────────────────
  private async getJson<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { accept: "application/json" },
        next: { revalidate: WEEK },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new QuranSourceUnavailableError(`Quran.com unreachable: ${url}`, { cause: e });
    }
    if (!res.ok) throw new QuranSourceUnavailableError(`Quran.com ${res.status} for ${url}`);
    try {
      return (await res.json()) as T;
    } catch (e) {
      throw new QuranSourceUnavailableError(`Quran.com returned invalid JSON for ${url}`, { cause: e });
    }
  }

  private async paginate<T>(path: string, field: string): Promise<T[]> {
    const out: T[] = [];
    let page: number | null = 1;
    for (let i = 0; page != null && i < MAX_PAGES; i++) {
      const sep = path.includes("?") ? "&" : "?";
      const data: Record<string, unknown> & { pagination?: QcPagination } = await this.getJson(
        `${this.base}${path}${sep}per_page=${PER_PAGE}&page=${page}`,
      );
      const items = data[field];
      if (!Array.isArray(items)) throw new QuranSourceUnavailableError(`Quran.com: missing "${field}" in ${path}`);
      out.push(...(items as T[]));
      page = data.pagination?.next_page ?? null;
    }
    return out;
  }

  private async loadSurah(n: number): Promise<SurahText> {
    const meta = getSurahMeta(n)!;
    const verses = await this.paginate<QcVerse>(
      `/verses/by_chapter/${n}?fields=text_uthmani,page_number,juz_number&words=false`,
      "verses",
    );
    verses.sort((a, b) => a.verse_number - b.verse_number);
    const ayahs: Ayah[] = verses.map((v) => ({
      surah: n,
      ayah: v.verse_number,
      key: v.verse_key,
      textUthmani: (v.text_uthmani ?? "").trim(),
      page: v.page_number,
      juz: v.juz_number,
      audioUrl: audioUrlFor(n, v.verse_number),
    }));
    return assertVerified({ meta, ayahs, source: sourceRef("quran-com:uthmani") });
  }

  private async loadTafsir(n: number, slug: TafsirSlug): Promise<TafsirEntry[]> {
    const src = KNOWLEDGE_SOURCES[TAFSIR_SOURCE_IDS[slug]];
    const rows = await this.paginate<QcTafsir>(`/tafsirs/${src.quranComTafsirId}/by_chapter/${n}`, "tafsirs");
    const ref = sourceRef(src.id);
    // Some tafsirs (e.g. Ibn Kathir) comment on a group of ayahs once and
    // return empty text for the rest of the group — keep only real entries.
    return rows
      .map((r) => ({ key: r.verse_key, text: stripHtml(r.text ?? ""), source: ref }))
      .filter((e) => e.text.length > 0 && e.key.startsWith(`${n}:`))
      .sort((a, b) => Number(a.key.split(":")[1]) - Number(b.key.split(":")[1]));
  }
}
