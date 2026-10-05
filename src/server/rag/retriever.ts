/**
 * Retrieval over APPROVED sources only. A passage is retrievable when its source is enabled and
 * approved/published AND (for stored chunks) the chunk itself is `published` and not demo —
 * demo or unreviewed content can never reach an answer.
 *
 *  TafsirRetriever   — deterministic: tafsir entries for referenced ayahs via the
 *                      QuranProvider; for a surah-only reference, ranks that surah's
 *                      entries by keyword overlap (normalizeArabic tokens).
 *  PgVectorRetriever — semantic: cosine search over KnowledgeChunk.embedding
 *                      (pgvector), filtered to approved sources.
 *  HybridRetriever   — runs both, merges, dedupes, sorts by score.
 */
import { tokenize } from "@/lib/quran/normalize";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import type { TafsirEntry } from "@/lib/types";
import { QuranSourceUnavailableError } from "../errors";
import type { EmbeddingProvider } from "../llm/provider";
import type { QuranProvider } from "../quran/common";
import type { ParsedReferences } from "./references";
import { approvedSourceIds, getSource, isApproved, TAFSIR_SOURCE_IDS, type KnowledgeKind, type TafsirSlug } from "./sources";

export interface Passage {
  sourceId: string;
  /** Human-readable reference, e.g. "مريم ٣٢" */
  ref: string;
  text: string;
  url?: string;
  /** 0..1, higher is more relevant. Direct ayah hits score 1. */
  score: number;
  ayahKey?: string;
  /** Provenance, carried through to the answer's citations and typed blocks. */
  kind?: KnowledgeKind;
  author?: string;
  locator?: string;
}

export interface RetrieveOptions {
  refs: ParsedReferences;
  limit: number;
}

export interface Retriever {
  readonly id: string;
  retrieve(query: string, opts: RetrieveOptions): Promise<Passage[]>;
}

export function ayahRefLabel(surah: number, from: number, to = from): string {
  const name = getSurahMeta(surah)?.nameAr ?? String(surah);
  return from === to ? `${name} ${toArabicDigits(from)}` : `${name} ${toArabicDigits(from)}–${toArabicDigits(to)}`;
}

export function quranComUrl(surah: number, ayah?: number): string {
  return ayah ? `https://quran.com/${surah}/${ayah}` : `https://quran.com/${surah}`;
}

// ── Keyword scoring ──────────────────────────────────────────────────────

const STOPWORDS = new Set(
  [
    "ما", "ماذا", "من", "في", "على", "علي", "عن", "الي", "الى", "هل", "كيف", "لماذا", "متي", "اين", "هو", "هي", "هذا", "هذه",
    "ذلك", "تلك", "التي", "الذي", "الذين", "او", "ثم", "قد", "لا", "لم", "لن", "ان", "كان", "كانت", "مع", "بين", "كل", "بعض",
    "معني", "تفسير", "اشرح", "فسر", "وضح", "المقصود", "سوره", "السوره", "ايه", "الايه", "ايات", "الايات", "قصه", "لي", "لنا",
    "اريد", "اعرف", "ارجو", "من فضلك", "القران", "الكريم", "قال", "تعالي", "الله",
  ].map((w) => tokenize(w).join(" ")),
);

/** Light stemming: drop clitics and the definite article so "والكتاب" ≈ "كتاب". */
function stem(token: string): string {
  let t = token;
  if (t.length > 4 && /^[وفبلك]ال/.test(t)) t = t.slice(1);
  if (t.length > 4 && t.startsWith("ال")) t = t.slice(2);
  if (t.length > 4 && t.startsWith("لل")) t = t.slice(2);
  if (t.length > 4 && /^[وف]/.test(t)) t = t.slice(1);
  return t;
}

export function queryTerms(query: string, exclude: string[] = []): string[] {
  const excluded = new Set(exclude.flatMap((e) => tokenize(e)).map(stem));
  const out = new Set<string>();
  for (const t of tokenize(query)) {
    if (t.length < 3 || STOPWORDS.has(t)) continue;
    const s = stem(t);
    if (!excluded.has(s)) out.add(s);
  }
  return [...out];
}

export function keywordScore(terms: string[], text: string): number {
  if (!terms.length) return 0;
  const bag = new Set(tokenize(text).map(stem));
  let hits = 0;
  for (const t of terms) if (bag.has(t)) hits++;
  return hits / terms.length;
}

// ── TafsirRetriever ──────────────────────────────────────────────────────

export class TafsirRetriever implements Retriever {
  readonly id: string;

  constructor(
    private quran: QuranProvider,
    private slug: TafsirSlug = "muyassar",
    private maxAyahs = 10,
  ) {
    this.id = `tafsir:${slug}`;
  }

  async retrieve(query: string, { refs, limit }: RetrieveOptions): Promise<Passage[]> {
    const sourceId = TAFSIR_SOURCE_IDS[this.slug];
    if (!isApproved(sourceId)) return [];

    if (refs.ranges.length) return this.forRanges(refs, sourceId);
    if (refs.surahs.length) return this.forSurahs(query, refs, sourceId, limit);
    return [];
  }

  private toPassage(e: TafsirEntry, sourceId: string, score: number): Passage {
    const [s, a] = e.key.split(":").map(Number);
    return { sourceId, ref: ayahRefLabel(s, a), text: e.text, url: quranComUrl(s, a), score, ayahKey: e.key, kind: "tafsir", author: getSource(sourceId)?.publisher };
  }

  /** Direct hits. Grouped tafsir (Ibn Kathir) is matched by the entry covering each ayah. */
  private async forRanges(refs: ParsedReferences, sourceId: string): Promise<Passage[]> {
    const out: Passage[] = [];
    const seen = new Set<string>();
    let budget = this.maxAyahs;
    for (const r of refs.ranges) {
      if (budget <= 0) break;
      const entries = await this.quran.getTafsir(r.surah, this.slug);
      const byAyah = entries.map((e) => ({ e, ayah: Number(e.key.split(":")[1]) }));
      for (let a = r.from; a <= r.to && budget > 0; a++, budget--) {
        const covering = byAyah.filter((x) => x.ayah <= a && a - x.ayah < 15).pop();
        if (covering && !seen.has(covering.e.key)) {
          seen.add(covering.e.key);
          out.push(this.toPassage(covering.e, sourceId, 1));
        }
      }
    }
    return out;
  }

  /** Surah-only reference: keyword overlap inside the surah, else its opening entries. */
  private async forSurahs(query: string, refs: ParsedReferences, sourceId: string, limit: number): Promise<Passage[]> {
    const names = refs.surahs.map((s) => getSurahMeta(s)?.nameAr ?? "");
    const terms = queryTerms(query, names);
    const out: Passage[] = [];
    for (const surah of refs.surahs.slice(0, 2)) {
      const entries = await this.quran.getTafsir(surah, this.slug);
      if (!terms.length) {
        out.push(...entries.slice(0, Math.min(limit, 3)).map((e) => this.toPassage(e, sourceId, 0.35)));
        continue;
      }
      const ranked = entries
        .map((e) => ({ e, s: keywordScore(terms, e.text) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s)
        .slice(0, limit);
      out.push(...ranked.map((x) => this.toPassage(x.e, sourceId, 0.4 + 0.5 * x.s)));
    }
    return out;
  }
}

// ── PgVectorRetriever ────────────────────────────────────────────────────

interface ChunkRow {
  sourceId: string;
  ref: string;
  text: string;
  ayahKey: string | null;
  url: string | null;
  kind: KnowledgeKind | null;
  author: string | null;
  locator: string | null;
  score: number;
}

export class PgVectorRetriever implements Retriever {
  readonly id = "pgvector";

  constructor(
    private embedder: EmbeddingProvider,
    private minScore = 0.3,
  ) {}

  async retrieve(query: string, { refs, limit }: RetrieveOptions): Promise<Passage[]> {
    const { getPrisma } = await import("../db");
    const prisma = await getPrisma();
    const [vec] = await this.embedder.embed([query]);
    if (!vec?.length) return [];
    const literal = `[${vec.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`;
    const sources = approvedSourceIds();
    const surahs = refs.surahs;

    // All values are bound parameters ($1..$4) — no string interpolation of input.
    const rows = await prisma.$queryRawUnsafe<ChunkRow[]>(
      `SELECT c."sourceId", c.ref, c.text, c."ayahKey", COALESCE(c.url, s.url) AS url, c.kind, c.author, c.locator,
              1 - (c.embedding <=> $1::vector) AS score
         FROM "KnowledgeChunk" c
         JOIN "KnowledgeSource" s ON s.id = c."sourceId"
        WHERE s.enabled = true
          AND s."reviewState" IN ('approved', 'published')
          AND c."reviewState" = 'published'
          AND c."isDemo" = false
          AND c.embedding IS NOT NULL
          AND c."sourceId" = ANY($2::text[])
          AND (cardinality($3::int[]) = 0 OR c.surah = ANY($3::int[]))
        ORDER BY c.embedding <=> $1::vector
        LIMIT $4`,
      literal,
      sources,
      surahs,
      limit,
    );
    return rows
      .filter((r) => isApproved(r.sourceId) && Number(r.score) >= this.minScore)
      .map((r) => {
        const [s, a] = (r.ayahKey ?? "").split(":").map(Number);
        return {
          sourceId: r.sourceId,
          ref: r.ref,
          text: r.text,
          url: s && a ? quranComUrl(s, a) : (r.url ?? getSource(r.sourceId)?.url),
          score: Number(r.score),
          ayahKey: r.ayahKey ?? undefined,
          kind: r.kind ?? getSource(r.sourceId)?.kind,
          author: r.author ?? getSource(r.sourceId)?.publisher,
          locator: r.locator ?? undefined,
        };
      });
  }
}

// ── HybridRetriever ──────────────────────────────────────────────────────

export class HybridRetriever implements Retriever {
  readonly id: string;

  constructor(private retrievers: Retriever[]) {
    this.id = `hybrid(${retrievers.map((r) => r.id).join("+")})`;
  }

  async retrieve(query: string, opts: RetrieveOptions): Promise<Passage[]> {
    const settled = await Promise.allSettled(this.retrievers.map((r) => r.retrieve(query, opts)));
    const merged = new Map<string, Passage>();
    let sourceDown: unknown = null;

    settled.forEach((res, i) => {
      if (res.status === "rejected") {
        if (res.reason instanceof QuranSourceUnavailableError) sourceDown = res.reason;
        else console.warn(`[rag] retriever ${this.retrievers[i].id} failed:`, (res.reason as Error)?.message);
        return;
      }
      for (const p of res.value) {
        if (!isApproved(p.sourceId)) continue; // defence in depth
        const key = `${p.sourceId}|${p.ayahKey ?? p.ref}|${p.text.slice(0, 40)}`;
        const prev = merged.get(key);
        if (!prev || p.score > prev.score) merged.set(key, p);
      }
    });

    // Nothing retrieved and the Quran/tafsir source was down → caller answers "unavailable".
    if (!merged.size && sourceDown) throw sourceDown;

    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, opts.limit);
  }
}
