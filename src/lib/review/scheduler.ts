/**
 * Spaced-repetition scheduler (SM-2 inspired, tuned for Quran review).
 *
 * The unit of memory is a single ayah; the unit of *work* is a contiguous
 * range (a reviewer recites passages, not isolated verses). So:
 *   1. every ayah carries its own ease / interval / streak
 *   2. the queue groups due ayahs into short contiguous ranges
 *   3. a recitation result updates each ayah from its own accuracy.
 */
import type { AyahProgress, ReviewBucket, ReviewItem } from "@/lib/types";

const DAY = 86_400_000;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
const MAX_RANGE = 10;

/** Map recitation accuracy (0..1) to an SM-2 quality grade (0..5). */
export function gradeFromAccuracy(accuracy: number): number {
  if (accuracy >= 0.97) return 5;
  if (accuracy >= 0.9) return 4;
  if (accuracy >= 0.75) return 3;
  if (accuracy >= 0.5) return 2;
  if (accuracy > 0) return 1;
  return 0;
}

export function newAyahProgress(surah: number, ayah: number, now = new Date()): AyahProgress {
  return {
    key: `${surah}:${ayah}`,
    surah,
    ayah,
    status: "memorized",
    memorizedAt: now.toISOString(),
    // first review the next day — consolidation matters most early
    nextReviewAt: new Date(now.getTime() + DAY).toISOString(),
    ease: 2.3,
    intervalDays: 1,
    streak: 0,
    successCount: 0,
    mistakeCount: 0,
  };
}

/** Apply one review outcome to an ayah. Pure function. */
export function applyReview(
  p: AyahProgress,
  outcome: { accuracy: number; mistakes: number },
  now = new Date(),
): AyahProgress {
  const q = gradeFromAccuracy(outcome.accuracy);
  let { ease, intervalDays, streak } = p;

  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = Math.min(MAX_EASE, Math.max(MIN_EASE, ease));

  if (q < 3) {
    streak = 0;
    intervalDays = 1; // relearn tomorrow
  } else {
    streak += 1;
    intervalDays = streak === 1 ? 1 : streak === 2 ? 3 : Math.round(intervalDays * ease);
    intervalDays = Math.min(intervalDays, 120);
  }

  const accuracy = p.accuracy == null ? outcome.accuracy : p.accuracy * 0.6 + outcome.accuracy * 0.4;
  const status: AyahProgress["status"] =
    q < 3 ? "weak" : streak >= 4 && accuracy >= 0.92 && intervalDays >= 14 ? "mastered" : "memorized";

  return {
    ...p,
    ease: Math.round(ease * 100) / 100,
    intervalDays,
    streak,
    status,
    accuracy: Math.round(accuracy * 1000) / 1000,
    successCount: p.successCount + (q >= 3 ? 1 : 0),
    mistakeCount: p.mistakeCount + outcome.mistakes,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: new Date(now.getTime() + intervalDays * DAY).toISOString(),
  };
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketFor(p: AyahProgress, now: Date): ReviewBucket {
  // Weak = the latest recitation outcome was below passing (status is set by applyReview). It is
  // NOT also derived from the blended rolling accuracy: one good recitation must clear it.
  if (p.status === "weak") return "weak";
  const due = p.nextReviewAt ? new Date(p.nextReviewAt) : now;
  if (due.getTime() <= startOfDay(now).getTime() + DAY) return "today";
  if (p.status === "mastered") return "mastered";
  return "upcoming";
}

/**
 * Build the review queue: contiguous ayahs from the same surah and bucket are
 * merged into ranges of at most MAX_RANGE ayahs, then prioritized.
 */
export function buildReviewQueue(progress: AyahProgress[], now = new Date()): ReviewItem[] {
  const tracked = progress
    .filter((p) => p.status !== "new" && p.status !== "learning")
    .sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);

  const items: ReviewItem[] = [];
  let cur: { items: AyahProgress[]; bucket: ReviewBucket } | null = null;

  const flush = () => {
    if (!cur || cur.items.length === 0) return;
    const ps = cur.items;
    const due = ps.reduce((m, p) => Math.min(m, new Date(p.nextReviewAt ?? now).getTime()), Infinity);
    const accs = ps.map((p) => p.accuracy).filter((a): a is number => a != null);
    const avgAccuracy = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : undefined;
    const mistakes = ps.reduce((s, p) => s + p.mistakeCount, 0);
    const overdueDays = Math.max(0, (now.getTime() - due) / DAY);
    const priority =
      overdueDays * 2 +
      (avgAccuracy == null ? 2 : (1 - avgAccuracy) * 12) +
      Math.min(mistakes, 10) * 0.5 +
      (cur.bucket === "weak" ? 6 : 0);
    items.push({
      surah: ps[0].surah,
      from: ps[0].ayah,
      to: ps[ps.length - 1].ayah,
      dueAt: new Date(due).toISOString(),
      priority: Math.round(priority * 10) / 10,
      bucket: cur.bucket,
      avgAccuracy,
      mistakes,
    });
    cur = null;
  };

  for (const p of tracked) {
    const b = bucketFor(p, now);
    const last = cur?.items[cur.items.length - 1];
    const contiguous = last && last.surah === p.surah && last.ayah + 1 === p.ayah && cur!.bucket === b;
    if (!contiguous || cur!.items.length >= MAX_RANGE) {
      flush();
      cur = { items: [], bucket: b };
    }
    cur!.items.push(p);
  }
  flush();

  return items.sort((a, b) => b.priority - a.priority || a.dueAt.localeCompare(b.dueAt));
}
