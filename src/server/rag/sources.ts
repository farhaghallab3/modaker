/**
 * Source registry.
 *
 * The assistant and the Quran providers may only use sources that are BOTH
 *   - `enabled`, and
 *   - in review state `approved` or `published`.
 * Anything else — including every "planned" source below — is invisible to retrieval, even if it
 * appears in this file.
 *
 * This file is the code-side definition used to seed the `KnowledgeSource` table
 * (`npm run registry:sync`). Sync only fills metadata and creates missing rows; it never changes
 * `enabled` / `reviewState` of an existing row — those are governed by the review workflow.
 * No credentials ever live here (API keys are environment variables only).
 *
 * Tiers (docs/ARCHITECTURE-safety.md):
 *   1 Quran foundation · 2 Quran understanding · 3 learning experience · 4 hadith & broader knowledge
 *
 * Adding a source: add an entry, keep it `enabled: false, reviewState: "draft"`, read the source's
 * official terms (set `licenseVerified` only after a person has), write an importer, then have a
 * reviewer approve it. See docs/ARCHITECTURE-backend.md §3.
 */
import type { ReviewState } from "@/lib/content-state";
import type { SourceRef } from "@/lib/types";

export type KnowledgeKind = "quran" | "tafsir" | "asbab" | "translation" | "curated" | "hadith" | "seerah" | "glossary" | "fiqh";
export type AuthorityType = "official_institution" | "scholarly_foundation" | "community_platform" | "aggregator" | "editorial_team";
export type TafsirSlug = "muyassar" | "ibn-kathir";

export interface KnowledgeSource extends SourceRef {
  kind: KnowledgeKind;
  language: "ar" | "en";
  description: string;
  /** Editorial content written by the Muddakir team. Must never be labelled as tafsir. */
  editorial?: boolean;
  /** Quran.com API v4 tafsir resource id, for tafsir sources. */
  quranComTafsirId?: number;

  // ── registry metadata ──
  tier: 1 | 2 | 3 | 4;
  authorityType: AuthorityType;
  /** Languages the source offers (BCP-47-ish; "multi" when the source says "many"). */
  languages: string[];
  apiAvailable: boolean;
  apiDocsUrl?: string;
  /** An MCP server exists. We still ingest through REST/datasets, not MCP, at runtime. */
  mcpAvailable: boolean;
  autoRetrievalSuitable: boolean;
  requiresHumanReview: boolean;
  licenseNote?: string;
  /** True only after a person has read and recorded the source's official terms. */
  licenseVerified: boolean;
  enabled: boolean;
  reviewState: ReviewState;
  reviewNote?: string;
}

const PLANNED = { enabled: false, reviewState: "draft" as const, licenseVerified: false };
const PDF_NOTE = "Terms and API details come from review.pdf only; not independently verified. A person must read the official terms before any integration.";

export const KNOWLEDGE_SOURCES: Record<string, KnowledgeSource> = {
  // ── Tier 1 — Quran foundation ──────────────────────────────────────────
  "quran-com:uthmani": {
    id: "quran-com:uthmani",
    title: "المصحف — الرسم العثماني (رواية حفص عن عاصم)",
    publisher: "Quran.com (Quran Foundation)",
    url: "https://quran.com",
    kind: "quran",
    language: "ar",
    description: "Uthmani text served by Quran.com API v4 (text_uthmani). Current verified runtime source.",
    tier: 1,
    authorityType: "community_platform",
    languages: ["ar"],
    apiAvailable: true,
    apiDocsUrl: "https://api-docs.quran.com",
    mcpAvailable: false,
    autoRetrievalSuitable: true,
    requiresHumanReview: false,
    licenseNote: "In production use; text is verified (counts + checksum) on every load. Keep as secondary/cross-check after any migration.",
    licenseVerified: false,
    enabled: true,
    reviewState: "published",
    reviewNote: "Approved by project configuration before the review workflow existed; re-confirm when a reviewer is assigned.",
  },
  "tanzil:uthmani": {
    id: "tanzil:uthmani",
    title: "المصحف — الرسم العثماني (مشروع تنزيل)",
    publisher: "Tanzil.net",
    url: "https://tanzil.net",
    kind: "quran",
    language: "ar",
    description: "Tanzil Uthmani text imported with scripts/import-quran.ts --tanzil (verified on import).",
    tier: 1,
    authorityType: "community_platform",
    languages: ["ar"],
    apiAvailable: false,
    mcpAvailable: false,
    autoRetrievalSuitable: true,
    requiresHumanReview: false,
    licenseNote: "Downloadable text; keep Tanzil's attribution requirements.",
    licenseVerified: false,
    enabled: true,
    reviewState: "published",
    reviewNote: "Approved by project configuration before the review workflow existed.",
  },
  "king-fahd-complex:quran": {
    id: "king-fahd-complex:quran",
    title: "المصحف — مجمع الملك فهد لطباعة المصحف الشريف",
    publisher: "مجمع الملك فهد لطباعة المصحف الشريف",
    url: "https://qurancomplex.gov.sa",
    kind: "quran",
    language: "ar",
    description: "Preferred FUTURE canonical Quran source (named in review.pdf). Do NOT switch the production source until docs/QURAN-SOURCE-MIGRATION-PLAN.md passes.",
    tier: 1,
    authorityType: "official_institution",
    languages: ["ar"],
    apiAvailable: true,
    apiDocsUrl: "https://qurancomplex.gov.sa/quran-dev",
    mcpAvailable: false,
    autoRetrievalSuitable: true,
    requiresHumanReview: false,
    licenseNote: `Dataset (XML/JSON, ayah + word ids, eight riwayat). ${PDF_NOTE}`,
    ...PLANNED,
  },
  "quranenc:translations": {
    id: "quranenc:translations",
    title: "ترجمات معاني القرآن الكريم — موسوعة القرآن الكريم",
    publisher: "جمعية خدمة المحتوى الإسلامي باللغات",
    url: "https://quranenc.com",
    kind: "translation",
    language: "ar",
    description: "Reviewed translations of the Quran's meanings (80+ languages) with versioned keys.",
    tier: 1,
    authorityType: "scholarly_foundation",
    languages: ["multi"],
    apiAvailable: true,
    apiDocsUrl: "https://quranenc.com/en/home/api",
    mcpAvailable: true,
    autoRetrievalSuitable: true,
    requiresHumanReview: false,
    licenseNote: PDF_NOTE,
    ...PLANNED,
  },

  // ── Tier 2 — Quran understanding ───────────────────────────────────────
  "tafsir:muyassar": {
    id: "tafsir:muyassar",
    title: "التفسير الميسر",
    publisher: "مجمع الملك فهد لطباعة المصحف الشريف",
    url: "https://quran.com",
    kind: "tafsir",
    language: "ar",
    quranComTafsirId: 16,
    description: "Concise Arabic tafsir by the King Fahd Complex. Default tafsir.",
    tier: 2,
    authorityType: "official_institution",
    languages: ["ar"],
    apiAvailable: true,
    mcpAvailable: false,
    autoRetrievalSuitable: true,
    requiresHumanReview: false,
    licenseNote: "Served through Quran.com's tafsir resource 16 and imported verbatim.",
    licenseVerified: false,
    enabled: true,
    reviewState: "published",
    reviewNote: "Approved by project configuration before the review workflow existed.",
  },
  "tafsir:ibn-kathir": {
    id: "tafsir:ibn-kathir",
    title: "تفسير ابن كثير",
    publisher: "الحافظ ابن كثير — عبر Quran.com",
    url: "https://quran.com",
    kind: "tafsir",
    language: "ar",
    quranComTafsirId: 14,
    description: "Ibn Kathir (Arabic). Long entries; chunked for retrieval. Not imported yet.",
    tier: 2,
    authorityType: "scholarly_foundation",
    languages: ["ar"],
    apiAvailable: true,
    mcpAvailable: false,
    autoRetrievalSuitable: true,
    requiresHumanReview: true,
    licenseNote: "Needs a reviewer to approve before import (tier 2).",
    ...PLANNED,
  },

  // ── Tier 3 — Quran learning experience ─────────────────────────────────
  "jamhara:terminology": {
    id: "jamhara:terminology",
    title: "موسوعة الجمهرة — مفردات المحتوى الإسلامي",
    publisher: "جمعية خدمة المحتوى الإسلامي باللغات",
    url: "https://islamic-content.com",
    kind: "glossary",
    language: "ar",
    description: "Reviewed Islamic terminology with approved equivalents. Preferred over machine translation for sensitive terms.",
    tier: 3,
    authorityType: "scholarly_foundation",
    languages: ["multi"],
    apiAvailable: false,
    mcpAvailable: true,
    autoRetrievalSuitable: false,
    requiresHumanReview: true,
    licenseNote: PDF_NOTE,
    ...PLANNED,
  },
  "muzakkir-curated": {
    id: "muzakkir-curated",
    title: "مقدمات تحريرية من مُدّكِر (ليست تفسيرًا)",
    publisher: "فريق مُدّكِر التحريري",
    kind: "curated",
    language: "ar",
    editorial: true,
    description: "Editorial story intros/chapter summaries. Disabled: the current stories are demo content and must never enter the knowledge base. Becomes usable only for stories that were reviewed AND published.",
    tier: 3,
    authorityType: "editorial_team",
    languages: ["ar"],
    apiAvailable: false,
    mcpAvailable: false,
    autoRetrievalSuitable: false,
    requiresHumanReview: true,
    ...PLANNED,
  },

  // ── Tier 4 — hadith & broader knowledge (design only; no integration yet) ─
  "hadeethenc:hadith": {
    id: "hadeethenc:hadith",
    title: "موسوعة الأحاديث النبوية",
    publisher: "جمعية خدمة المحتوى الإسلامي باللغات",
    url: "https://hadeethenc.com",
    kind: "hadith",
    language: "ar",
    description: "Authentic hadith with explanations and grading (Arabic + translations). Retrieved at question time from the official public API (src/server/hadith/hadeethenc.ts); shown verbatim with grade, reference and a link.",
    tier: 4,
    authorityType: "scholarly_foundation",
    languages: ["multi"],
    apiAvailable: true,
    apiDocsUrl: "https://hadeethenc.com/api-docs",
    mcpAvailable: true,
    autoRetrievalSuitable: true,
    requiresHumanReview: false,
    licenseNote:
      "Terms (API docs + site): contents may be used with no modification, addition or deletion, and clear attribution to the publisher and HadeethEnc.com; robots.txt Content-Signal: ai-train=yes, search=yes, ai-input=yes. Approved for question-time API retrieval with a small in-memory cache.",
    licenseVerified: true,
    enabled: true,
    reviewState: "published" as const,
  },
  // General fiqh (knowledge gap B-01 in docs/BACKLOG.md). Registered so the taxonomy and admin
  // screens know about it; inert until a reviewer approves a source and a person verifies its terms.
  "kuwaiti-fiqh-encyclopedia": {
    id: "kuwaiti-fiqh-encyclopedia",
    title: "الموسوعة الفقهية الكويتية",
    publisher: "وزارة الأوقاف والشؤون الإسلامية — دولة الكويت",
    url: "https://bohoth.awqaf.gov.kw",
    kind: "fiqh",
    language: "ar",
    description: "Contemporary encyclopedia arranged alphabetically across the four madhhabs (45 volumes); suited to stating positions by madhhab and where they differ. Volumes are downloadable (Word/PDF); no API stated.",
    tier: 4,
    authorityType: "official_institution",
    languages: ["ar"],
    apiAvailable: false,
    mcpAvailable: false,
    autoRetrievalSuitable: false,
    requiresHumanReview: true,
    licenseNote: PDF_NOTE,
    ...PLANNED,
  },
  "dorar:fiqh": {
    id: "dorar:fiqh",
    title: "الدرر السنية — الموسوعة الفقهية",
    publisher: "مؤسسة الدرر السنية",
    url: "https://dorar.net/feqhia",
    kind: "fiqh",
    language: "ar",
    description: "General fiqh encyclopedia named in review.pdf for general jurisprudence. Must not be turned into a personal fatwa or an automatic tarjih.",
    tier: 4,
    authorityType: "scholarly_foundation",
    languages: ["ar"],
    apiAvailable: false,
    mcpAvailable: false,
    autoRetrievalSuitable: false,
    requiresHumanReview: true,
    licenseNote: PDF_NOTE,
    ...PLANNED,
  },
  "dorar:hadith-verification": {
    id: "dorar:hadith-verification",
    title: "الدرر السنية — الموسوعة الحديثية",
    publisher: "مؤسسة الدرر السنية",
    url: "https://dorar.net",
    kind: "hadith",
    language: "ar",
    description: "Hadith grading/verification reference. Use to verify, not to bulk-ingest.",
    tier: 4,
    authorityType: "scholarly_foundation",
    languages: ["ar"],
    apiAvailable: true,
    apiDocsUrl: "https://dorar.net/article/389",
    mcpAvailable: false,
    autoRetrievalSuitable: false,
    requiresHumanReview: true,
    licenseNote: PDF_NOTE,
    ...PLANNED,
  },
};

export const TAFSIR_SOURCE_IDS: Record<TafsirSlug, string> = {
  muyassar: "tafsir:muyassar",
  "ibn-kathir": "tafsir:ibn-kathir",
};

export function getSource(id: string): KnowledgeSource | undefined {
  return KNOWLEDGE_SOURCES[id];
}

/** The single rule for "may anything from this source be retrieved or cited?". */
export function isSourceUsable(s: Pick<KnowledgeSource, "enabled" | "reviewState">): boolean {
  return s.enabled && (s.reviewState === "approved" || s.reviewState === "published");
}

export function isApproved(id: string): boolean {
  const s = KNOWLEDGE_SOURCES[id];
  return !!s && isSourceUsable(s);
}

/** Is there an approved, published source of asbab al-nuzul? (None yet: the question is abstained, never answered from tafsir.) */
export function hasApprovedAsbabSource(): boolean {
  return Object.values(KNOWLEDGE_SOURCES).some((s) => s.kind === "asbab" && isSourceUsable(s));
}

export function approvedSourceIds(): string[] {
  return Object.values(KNOWLEDGE_SOURCES)
    .filter(isSourceUsable)
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
