/**
 * Well-known Quranic passages asked about by name («أصحاب الفيل», «قارون») that are NOT stories on the
 * product's Stories page — those live in story-ranges.ts, which must mirror the product stories exactly.
 * A question naming one is answered from the approved tafsir of the passage. Pure data; no Quran text.
 */
import { normalizeArabic } from "@/lib/quran/normalize";
import type { AyahRange } from "@/lib/types";

interface NamedPassage {
  id: string;
  /** Normalized phrases (normalizeArabic), matched as whole words inside the question. */
  aliases: string[];
  ranges: AyahRange[];
}

export const NAMED_PASSAGES: readonly NamedPassage[] = [
  { id: "ashab-al-fil", aliases: ["اصحاب الفيل", "عام الفيل", "قصه الفيل", "ابرهه"], ranges: [{ surah: 105, from: 1, to: 5 }] },
  { id: "ashab-al-ukhdud", aliases: ["اصحاب الاخدود", "قصه الاخدود"], ranges: [{ surah: 85, from: 4, to: 10 }] },
  { id: "qarun", aliases: ["قارون", "قصه قارون"], ranges: [{ surah: 28, from: 76, to: 82 }] },
];

/** The ranges of a passage named in the question, or null. */
export function resolveNamedPassage(question: string): AyahRange[] | null {
  const q = ` ${normalizeArabic(question)} `;
  for (const p of NAMED_PASSAGES) {
    if (p.aliases.some((a) => q.includes(` ${a} `))) return p.ranges.map((r) => ({ ...r }));
  }
  return null;
}
