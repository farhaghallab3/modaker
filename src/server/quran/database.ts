/**
 * PostgreSQL-backed provider: serves text imported by scripts/import-quran.ts
 * (Quran.com or Tanzil, verified + checksummed at import time). Checksums are
 * re-verified on first load per process.
 */
import { getSurahMeta } from "@/lib/quran/surahs";
import type { Ayah, AyahRange, SurahText, TafsirEntry } from "@/lib/types";
import { QuranSourceUnavailableError } from "../errors";
import { KNOWLEDGE_SOURCES, sourceRef, TAFSIR_SOURCE_IDS, type TafsirSlug } from "../rag/sources";
import { PromiseCache, assertSurah, audioUrlFor, sliceRange, type QuranProvider } from "./common";
import { assertVerified } from "./verification";

export class DatabaseQuranProvider implements QuranProvider {
  readonly id = "database";
  private surahs = new PromiseCache<SurahText>(120);
  private tafsir = new PromiseCache<TafsirEntry[]>(240);

  getSurah(n: number): Promise<SurahText> {
    assertSurah(n);
    return this.surahs.get(String(n), () => this.load(n));
  }

  async getAyahs(range: AyahRange): Promise<Ayah[]> {
    return sliceRange(await this.getSurah(range.surah), range);
  }

  getTafsir(n: number, slug: TafsirSlug): Promise<TafsirEntry[]> {
    assertSurah(n);
    return this.tafsir.get(`${slug}:${n}`, () => this.loadTafsir(n, slug));
  }

  private async prisma() {
    // Lazy: keeps @prisma/client out of the import graph for other providers.
    const { getPrisma } = await import("../db");
    return getPrisma();
  }

  private async load(n: number): Promise<SurahText> {
    const prisma = await this.prisma();
    let row;
    try {
      row = await prisma.surah.findUnique({
        where: { number: n },
        include: { ayahs: { orderBy: { number: "asc" } } },
      });
    } catch (e) {
      throw new QuranSourceUnavailableError(`database query failed for surah ${n}`, { cause: e });
    }
    if (!row || row.ayahs.length === 0) {
      throw new QuranSourceUnavailableError(`surah ${n} not imported — run \`npm run db:seed:quran\``);
    }
    const source = KNOWLEDGE_SOURCES[row.sourceId] ? sourceRef(row.sourceId) : sourceRef("quran-com:uthmani");
    const text: SurahText = {
      meta: getSurahMeta(n)!,
      source,
      ayahs: row.ayahs.map((a) => ({
        surah: n,
        ayah: a.number,
        key: a.key,
        textUthmani: a.textUthmani,
        textSimple: a.textSimple ?? undefined,
        page: a.page ?? undefined,
        juz: a.juz ?? undefined,
        audioUrl: audioUrlFor(n, a.number),
      })),
    };
    // Compare against the checksum recorded at import: detects tampering/corruption.
    return assertVerified(text, row.checksum);
  }

  private async loadTafsir(n: number, slug: TafsirSlug): Promise<TafsirEntry[]> {
    const prisma = await this.prisma();
    const sourceId = TAFSIR_SOURCE_IDS[slug];
    try {
      const rows = await prisma.tafsirEntry.findMany({
        where: { sourceId, surah: n, source: { approved: true } },
        orderBy: { ayah: "asc" },
      });
      const ref = sourceRef(sourceId);
      return rows.map((r) => ({ key: r.key, text: r.text, source: ref }));
    } catch (e) {
      throw new QuranSourceUnavailableError(`database tafsir query failed for ${slug}:${n}`, { cause: e });
    }
  }
}
