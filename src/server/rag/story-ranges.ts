/**
 * Quranic stories already in the product → the Quran ranges that tell them (the chapter ranges of
 * src/content/stories.ts). A story question is answered from the approved tafsir of these ranges —
 * never from the editorial story copy (which is demo / unreviewed) and never from model memory.
 * Pure data + matching; no Quran text.
 */
import { normalizeArabic } from "@/lib/quran/normalize";
import type { AyahRange } from "@/lib/types";

interface StoryMapping {
  id: string;
  /** Normalized phrases (see normalizeArabic): matched as whole words inside the question. */
  aliases: string[];
  ranges: AyahRange[];
}

export const STORY_RANGES: readonly StoryMapping[] = [
  { id: "ashab-al-kahf", aliases: ["اصحاب الكهف", "اهل الكهف", "فتيه الكهف"], ranges: [{ surah: 18, from: 9, to: 26 }] },
  { id: "musa-wal-khidr", aliases: ["موسي والخضر", "موسي و الخضر", "قصه الخضر", "الخضر"], ranges: [{ surah: 18, from: 60, to: 82 }] },
  { id: "dhul-qarnayn", aliases: ["ذي القرنين", "ذو القرنين", "ذا القرنين", "ذوالقرنين"], ranges: [{ surah: 18, from: 83, to: 98 }] },
  { id: "yusuf", aliases: ["قصه يوسف", "سيدنا يوسف", "نبي الله يوسف", "يوسف عليه السلام"], ranges: [{ surah: 12, from: 4, to: 101 }] },
  { id: "maryam", aliases: ["قصه مريم", "مريم عليها السلام", "السيده مريم"], ranges: [{ surah: 19, from: 16, to: 36 }] },
  { id: "zakariya-yahya", aliases: ["قصه زكريا", "زكريا ويحيي", "زكريا و يحيي", "نبي الله يحيي"], ranges: [{ surah: 19, from: 2, to: 15 }] },
];

/** The mapped Quran ranges for a story named in the question, or null when none is named. */
export function resolveStoryRanges(question: string): AyahRange[] | null {
  const q = ` ${normalizeArabic(question)} `;
  for (const s of STORY_RANGES) {
    if (s.aliases.some((a) => q.includes(` ${a} `))) return s.ranges.map((r) => ({ ...r }));
  }
  return null;
}

/** Evenly spread single-ayah ranges (first and last included) so a long story is represented end to end within `max` ayahs. */
export function spreadRanges(ranges: AyahRange[], max: number): AyahRange[] {
  const all = ranges.flatMap((r) => Array.from({ length: r.to - r.from + 1 }, (_, i) => ({ surah: r.surah, from: r.from + i, to: r.from + i })));
  if (all.length <= max) return all;
  const out: AyahRange[] = [];
  for (let i = 0; i < max; i++) out.push(all[Math.round((i * (all.length - 1)) / (max - 1))]);
  return out.filter((r, i) => out.findIndex((x) => x.surah === r.surah && x.from === r.from) === i);
}
