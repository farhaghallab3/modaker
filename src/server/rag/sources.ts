/**
 * Registry of APPROVED knowledge sources. The assistant and the Quran
 * providers may only cite sources listed here with `approved: true`.
 *
 * Adding a source: add an entry here, write an importer that stores its text
 * as TafsirEntry / KnowledgeChunk rows with this `id` as sourceId, run
 * `npm run kb:index`, and have the content reviewed before flipping
 * `approved` to true. See docs/ARCHITECTURE-backend.md §3.
 */
import type { SourceRef } from "@/lib/types";

export type KnowledgeKind = "quran" | "tafsir" | "asbab" | "translation" | "curated";
export type TafsirSlug = "muyassar" | "ibn-kathir";

export interface KnowledgeSource extends SourceRef {
  kind: KnowledgeKind;
  approved: boolean;
  language: "ar" | "en";
  /** Editorial content written by the Muddakir team. Must never be labelled as tafsir. */
  editorial?: boolean;
  /** Quran.com API v4 tafsir resource id, for tafsir sources. */
  quranComTafsirId?: number;
  description: string;
}

export const KNOWLEDGE_SOURCES: Record<string, KnowledgeSource> = {
  "quran-com:uthmani": {
    id: "quran-com:uthmani",
    title: "المصحف — الرسم العثماني (رواية حفص عن عاصم)",
    publisher: "Quran.com (Quran Foundation)",
    url: "https://quran.com",
    kind: "quran",
    approved: true,
    language: "ar",
    description: "Uthmani text served by Quran.com API v4 (text_uthmani).",
  },
  "tanzil:uthmani": {
    id: "tanzil:uthmani",
    title: "المصحف — الرسم العثماني (مشروع تنزيل)",
    publisher: "Tanzil.net",
    url: "https://tanzil.net",
    kind: "quran",
    approved: true,
    language: "ar",
    description: "Tanzil Uthmani text imported with scripts/import-quran.ts --tanzil (verified on import).",
  },
  "tafsir:muyassar": {
    id: "tafsir:muyassar",
    title: "التفسير الميسر",
    publisher: "مجمع الملك فهد لطباعة المصحف الشريف",
    url: "https://quran.com",
    kind: "tafsir",
    approved: true,
    language: "ar",
    quranComTafsirId: 16,
    description: "Concise Arabic tafsir by the King Fahd Complex. Default tafsir.",
  },
  "tafsir:ibn-kathir": {
    id: "tafsir:ibn-kathir",
    title: "تفسير ابن كثير",
    publisher: "الحافظ ابن كثير — عبر Quran.com",
    url: "https://quran.com",
    kind: "tafsir",
    approved: true,
    language: "ar",
    quranComTafsirId: 14,
    description: "Ibn Kathir (Arabic). Long entries; chunked for retrieval.",
  },
  "muzakkir-curated": {
    id: "muzakkir-curated",
    title: "مقدمات تحريرية من مُدّكِر (ليست تفسيرًا)",
    publisher: "فريق مُدّكِر التحريري",
    kind: "curated",
    approved: true,
    editorial: true,
    language: "ar",
    description: "Reviewed editorial story intros/chapter summaries. Context only — never presented as tafsir.",
  },
};

export const TAFSIR_SOURCE_IDS: Record<TafsirSlug, string> = {
  muyassar: "tafsir:muyassar",
  "ibn-kathir": "tafsir:ibn-kathir",
};

export function getSource(id: string): KnowledgeSource | undefined {
  return KNOWLEDGE_SOURCES[id];
}

export function isApproved(id: string): boolean {
  return KNOWLEDGE_SOURCES[id]?.approved === true;
}

export function approvedSourceIds(): string[] {
  return Object.values(KNOWLEDGE_SOURCES)
    .filter((s) => s.approved)
    .map((s) => s.id);
}

/** Public, serialisable reference (what the API returns). */
export function sourceRef(id: string): SourceRef {
  const s = KNOWLEDGE_SOURCES[id];
  if (!s) throw new Error(`Unknown knowledge source: ${id}`);
  return { id: s.id, title: s.title, publisher: s.publisher, url: s.url };
}

export function tafsirSourceRef(slug: TafsirSlug): SourceRef {
  return sourceRef(TAFSIR_SOURCE_IDS[slug]);
}
