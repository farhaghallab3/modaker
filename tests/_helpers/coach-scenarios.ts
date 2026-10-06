/** Four learner states for the Session Coach (shared by tests/coach.test.ts and scripts/coach-scenarios.ts). */
import { declareMemorized, recordOutcome } from "../../src/lib/review/learning";
import { EMPTY_STATE, todayKey, type UserState } from "../../src/lib/store/state";
import type { AyahProgress } from "../../src/lib/types";

const DAY = 86_400_000;
export const NOW = new Date(2026, 9, 10, 9, 0, 0);
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

function declare(rows: Record<string, AyahProgress>, surah: number, from: number, to: number, declaredDaysAgo: number, intervalDays = 1) {
  for (let a = from; a <= to; a++) {
    const p = declareMemorized(undefined, surah, a, ago(declaredDaysAgo));
    rows[p.key] = { ...p, intervalDays, nextReviewAt: new Date(ago(declaredDaysAgo).getTime() + intervalDays * DAY).toISOString() };
  }
}

const base = (progress: Record<string, AyahProgress>, extra: Partial<UserState> = {}): UserState => ({
  ...EMPTY_STATE,
  profile: {
    id: "u",
    name: "اسم لا يجب أن يُرسل",
    email: "private@example.test",
    level: "beginner",
    memorizedAmount: "none",
    dailyTargetAyahs: 5,
    reviewSessionsPerDay: 2,
    reminderTime: "05:30",
    locale: "ar",
    createdAt: ago(30).toISOString(),
    onboarded: true,
  },
  progress,
  activity: [3, 2, 1].map((d) => ({ date: todayKey(ago(d)), memorized: 3, reviewed: 4, recitations: 1 })),
  ...extra,
});

/** 1 — unfinished memorization (Al-Mulk 1–11), nothing due. */
export function scenarioUnfinished(): UserState {
  const p: Record<string, AyahProgress> = {};
  declare(p, 67, 1, 11, 0, 3); // declared today, next review in 3 days
  return base(p, { resume: { surah: 67, ayah: 12, mode: "memorize", updatedAt: NOW.toISOString() } });
}

/** 2 — due reviews AND unfinished memorization. */
export function scenarioDue(): UserState {
  const p: Record<string, AyahProgress> = {};
  declare(p, 67, 1, 11, 4, 2); // due 2 days ago
  declare(p, 18, 1, 6, 5, 3); // due 2 days ago
  return base(p, { resume: { surah: 67, ayah: 12, mode: "memorize", updatedAt: NOW.toISOString() } });
}

/** 3 — weak ayahs from a confirmed recitation difference (plus a saved recitation). */
export function scenarioWeak(): UserState {
  const p: Record<string, AyahProgress> = {};
  declare(p, 67, 1, 11, 4, 2);
  for (const a of [5, 6]) p[`67:${a}`] = recordOutcome(p[`67:${a}`], 67, a, { accuracy: 0.4, mistakes: 3, recId: "rec_w" }, ago(1));
  return base(p, {
    resume: { surah: 67, ayah: 12, mode: "memorize", updatedAt: NOW.toISOString() },
    recitations: [{ id: "rec_w", at: ago(1).toISOString(), surah: 67, from: 1, to: 11, accuracy: 0.8, mistakes: 6, mastered: 8, needsReview: 2, uncertain: 1 }],
  });
}

/** 4 — caught up: Al-Mulk complete, nothing due, a streak. */
export function scenarioCaughtUp(): UserState {
  const p: Record<string, AyahProgress> = {};
  declare(p, 67, 1, 30, 1, 6); // all declared yesterday, next review in 5 days
  return base(p, {
    resume: { surah: 67, ayah: 30, mode: "memorize", updatedAt: NOW.toISOString() },
    recitations: [{ id: "rec_ok", at: ago(1).toISOString(), surah: 67, from: 1, to: 30, accuracy: 0.97, mistakes: 0, mastered: 30, needsReview: 0 }],
  });
}

export const SCENARIOS = [
  { name: "1. unfinished memorization, nothing due", build: scenarioUnfinished },
  { name: "2. due reviews + unfinished memorization", build: scenarioDue },
  { name: "3. weak ayahs", build: scenarioWeak },
  { name: "4. caught up / nothing urgent", build: scenarioCaughtUp },
] as const;
