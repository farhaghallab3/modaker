/**
 * English translation of the meanings, from QuranEnc (vendor-specific code lives only here).
 *
 *   GET {QURANENC_API}/translation/sura/{key}/{n} → { result: [{ sura, aya, translation, footnotes }] }
 *
 * The translation is shown verbatim with its source. It is never generated, never used as
 * Quran text, and never indexed for the assistant. A surah is rejected unless every ayah
 * comes back exactly once, in order.
 */
import { getSurahMeta } from "@/lib/quran/surahs";
import type { TranslationEntry } from "@/lib/types";
import { env } from "../env";
import { QuranSourceUnavailableError } from "../errors";
import { ENGLISH_TRANSLATION_SOURCE_ID, getSource, isSourceUsable, sourceRef } from "../rag/sources";
import { PromiseCache, assertSurah, stripHtml } from "./common";

const WEEK = 604_800;

interface QeRow {
  sura?: number | string;
  aya?: number | string;
  translation?: string;
  footnotes?: string | null;
}

type FetchLike = (url: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

export class QuranEncTranslationProvider {
  private cache = new PromiseCache<TranslationEntry[]>(240);

  constructor(
    private sourceId = ENGLISH_TRANSLATION_SOURCE_ID,
    private base = env.quranencApi(),
    private fetchImpl: FetchLike = fetch as FetchLike,
  ) {}

  getSurah(n: number): Promise<TranslationEntry[]> {
    assertSurah(n);
    return this.cache.get(String(n), () => this.load(n));
  }

  private async load(n: number): Promise<TranslationEntry[]> {
    const src = getSource(this.sourceId);
    if (!src || !src.quranencKey || !isSourceUsable(src)) {
      throw new QuranSourceUnavailableError(`translation source not approved: ${this.sourceId}`);
    }
    const url = `${this.base}/translation/sura/${src.quranencKey}/${n}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { accept: "application/json" },
        next: { revalidate: WEEK },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new QuranSourceUnavailableError(`QuranEnc unreachable: ${url}`, { cause: e });
    }
    if (!res.ok) throw new QuranSourceUnavailableError(`QuranEnc ${res.status} for ${url}`);
    let data: { result?: unknown };
    try {
      data = (await res.json()) as { result?: unknown };
    } catch (e) {
      throw new QuranSourceUnavailableError(`QuranEnc returned invalid JSON for ${url}`, { cause: e });
    }
    return parseSurahTranslation(n, data, sourceRef(src.id));
  }
}

/** Validate and normalise one surah's rows. Throws unless ayahs 1..count are all present. */
export function parseSurahTranslation(n: number, data: { result?: unknown }, source: TranslationEntry["source"]): TranslationEntry[] {
  const meta = getSurahMeta(n);
  if (!meta) throw new QuranSourceUnavailableError(`unknown surah ${n}`);
  if (!Array.isArray(data.result)) throw new QuranSourceUnavailableError(`QuranEnc: missing "result" for surah ${n}`);
  const rows = (data.result as QeRow[])
    .map((r) => ({ sura: Number(r.sura), aya: Number(r.aya), text: stripHtml(r.translation ?? ""), footnotes: stripHtml(r.footnotes ?? "") }))
    .sort((a, b) => a.aya - b.aya);
  const ok =
    rows.length === meta.ayahCount &&
    rows.every((r, i) => r.sura === n && r.aya === i + 1 && r.text.length > 0);
  if (!ok) throw new QuranSourceUnavailableError(`QuranEnc: surah ${n} translation is incomplete or out of order`);
  return rows.map((r) => ({
    key: `${n}:${r.aya}`,
    text: r.text,
    ...(r.footnotes ? { footnotes: r.footnotes } : {}),
    source,
  }));
}

let instance: QuranEncTranslationProvider | null = null;
export function getTranslationProvider(): QuranEncTranslationProvider {
  return (instance ??= new QuranEncTranslationProvider());
}
