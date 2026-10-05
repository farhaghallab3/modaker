/**
 * Range helpers for the recitation flow. Pure.
 */
import { tokenize } from "@/lib/quran/normalize";
import { isMemorized } from "@/lib/review/learning";
import type { AyahProgress, AyahRange } from "@/lib/types";

/** Max ayahs per recitation — mirrors MAX_RECITATION_AYAHS on the server. */
export const MAX_RECITE_AYAHS = 30;

/** Group memorized ayahs into contiguous runs per surah, split into chunks of ≤ `chunk`. */
export function memorizedRanges(progress: AyahProgress[], chunk = 10): AyahRange[] {
  const ps = progress
    .filter(isMemorized)
    .sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  const out: AyahRange[] = [];
  for (const p of ps) {
    const last = out[out.length - 1];
    if (last && last.surah === p.surah && last.to + 1 === p.ayah && last.to - last.from + 1 < chunk) last.to = p.ayah;
    else out.push({ surah: p.surah, from: p.ayah, to: p.ayah });
  }
  return out;
}

/** Clamp a requested range to the surah and the per-session maximum. */
export function clampRange(
  surah: number,
  from: number,
  to: number,
  ayahCount: number,
  max = MAX_RECITE_AYAHS,
): AyahRange & { clamped: boolean } {
  const f = Math.min(Math.max(1, Math.floor(from) || 1), ayahCount);
  let t = Math.min(Math.max(f, Math.floor(to) || f), ayahCount);
  let clamped = f !== from || t !== to;
  if (t - f + 1 > max) {
    t = f + max - 1;
    clamped = true;
  }
  return { surah, from: f, to: t, clamped };
}

/** First word of a verified ayah — used for the optional recitation hint. */
export function firstWord(text: string): string {
  // skip stray annotation marks so the hint is always a real word
  return text.trim().split(/\s+/).find((w) => tokenize(w).length > 0) ?? "";
}
