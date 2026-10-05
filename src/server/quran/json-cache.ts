/**
 * Offline/dev provider: reads files written by
 *   npm run quran:cache            → data/quran/{n}.json      (SurahText)
 *   npm run db:seed:tafsir -- --json-only → data/tafsir/{slug}/{n}.json (TafsirEntry[])
 * Files are re-verified on read (count, keys, and the checksum stored in the file).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSurahMeta } from "@/lib/quran/surahs";
import type { Ayah, AyahRange, SurahText, TafsirEntry } from "@/lib/types";
import { env } from "../env";
import { QuranSourceUnavailableError } from "../errors";
import { sourceRef, TAFSIR_SOURCE_IDS, type TafsirSlug } from "../rag/sources";
import { PromiseCache, assertSurah, audioUrlFor, sliceRange, type QuranProvider } from "./common";
import { assertVerified } from "./verification";

/** On-disk format (adds the checksum computed at import time). */
export interface SurahJsonFile extends SurahText {
  checksum: string;
  fetchedAt: string;
}

export class JsonCacheQuranProvider implements QuranProvider {
  readonly id = "json";
  private surahs = new PromiseCache<SurahText>(120);
  private tafsir = new PromiseCache<TafsirEntry[]>(240);

  constructor(
    private quranDir = env.quranJsonDir(),
    private tafsirDir = env.tafsirJsonDir(),
  ) {}

  getSurah(n: number): Promise<SurahText> {
    assertSurah(n);
    return this.surahs.get(String(n), () => this.load(n));
  }

  async getAyahs(range: AyahRange): Promise<Ayah[]> {
    return sliceRange(await this.getSurah(range.surah), range);
  }

  getTafsir(n: number, slug: TafsirSlug): Promise<TafsirEntry[]> {
    assertSurah(n);
    return this.tafsir.get(`${slug}:${n}`, async () => {
      const file = await readJsonFile<TafsirEntry[]>(path.resolve(this.tafsirDir, slug, `${n}.json`));
      const ref = sourceRef(TAFSIR_SOURCE_IDS[slug]);
      return file.filter((e) => e.key?.startsWith(`${n}:`) && e.text).map((e) => ({ key: e.key, text: e.text, source: ref }));
    });
  }

  private async load(n: number): Promise<SurahText> {
    const file = await readJsonFile<SurahJsonFile>(path.resolve(this.quranDir, `${n}.json`));
    const text: SurahText = {
      meta: getSurahMeta(n)!,
      source: file.source,
      ayahs: file.ayahs.map((a) => ({ ...a, audioUrl: audioUrlFor(n, a.ayah) })),
    };
    return assertVerified(text, file.checksum);
  }
}

async function readJsonFile<T>(file: string): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    throw new QuranSourceUnavailableError(`missing cache file ${file} — run \`npm run quran:cache\``, { cause: e });
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new QuranSourceUnavailableError(`corrupt cache file ${file}`, { cause: e });
  }
}
