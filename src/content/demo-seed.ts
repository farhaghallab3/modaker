/**
 * DEMO DATA — synthetic progress for a sample learner.
 * Contains no Quran text: only surah/ayah numbers, dates and scores.
 * Loaded only through "جرّب النسخة التجريبية"; the UI shows a demo badge.
 */
import { applyReview, newAyahProgress } from "@/lib/review/scheduler";
import { DEFAULT_PREFS, EMPTY_STATE, todayKey, type UserState } from "@/lib/store/state";
import type { AyahProgress, DailyActivity } from "@/lib/types";

const DAY = 86_400_000;

function seedRange(
  out: Record<string, AyahProgress>,
  surah: number,
  from: number,
  to: number,
  daysAgo: number,
  reviews: number[], // accuracies applied in sequence
  now: Date,
) {
  for (let a = from; a <= to; a++) {
    const start = new Date(now.getTime() - daysAgo * DAY);
    let p = newAyahProgress(surah, a, start);
    reviews.forEach((acc, i) => {
      const when = new Date(start.getTime() + (i + 1) * Math.max(1, Math.floor(daysAgo / (reviews.length + 1))) * DAY);
      // vary per ayah a little so the data looks lived-in
      const jitter = ((a * 7 + i * 3) % 10) / 100 - 0.04;
      p = applyReview(p, { accuracy: Math.max(0, Math.min(1, acc + jitter)), mistakes: acc + jitter < 0.85 ? 2 : 0 }, when);
    });
    out[p.key] = p;
  }
}

export function buildDemoState(now = new Date()): UserState {
  const progress: Record<string, AyahProgress> = {};
  // Al-Mulk: fully memorized, mostly strong
  seedRange(progress, 67, 1, 30, 60, [0.96, 0.98, 0.97, 0.99, 0.98], now);
  // Al-Kahf opening ten: strong but due
  seedRange(progress, 18, 1, 10, 30, [0.95, 0.96, 0.97], now);
  // Yusuf 1–20: some weak spots
  seedRange(progress, 12, 1, 14, 21, [0.92, 0.9], now);
  seedRange(progress, 12, 15, 20, 12, [0.7, 0.62], now);
  // Maryam 1–31: current surah, recent
  seedRange(progress, 19, 1, 22, 10, [0.94, 0.95], now);
  seedRange(progress, 19, 23, 31, 3, [0.86], now);

  const activity: DailyActivity[] = [];
  for (let i = 20; i >= 1; i--) {
    if (i === 9 || i === 15) continue; // a couple of quiet days
    const d = new Date(now.getTime() - i * DAY);
    activity.push({
      date: todayKey(d),
      memorized: i % 3 === 0 ? 0 : 3 + (i % 4),
      reviewed: 8 + ((i * 5) % 12),
      recitations: 1 + (i % 2),
    });
  }

  return {
    ...EMPTY_STATE,
    demo: true,
    session: { userId: "demo", email: "demo@muzakkir.app" },
    profile: {
      id: "demo",
      name: "ضيف مُدّكِر",
      email: "demo@muzakkir.app",
      level: "intermediate",
      memorizedAmount: "few-juz",
      dailyTargetAyahs: 5,
      reviewSessionsPerDay: 2,
      reminderTime: "05:30",
      locale: "ar",
      createdAt: new Date(now.getTime() - 60 * DAY).toISOString(),
      onboarded: true,
    },
    progress,
    resume: { surah: 19, ayah: 32, mode: "memorize", updatedAt: new Date(now.getTime() - DAY).toISOString() },
    activity,
    bookmarks: [
      { key: "19:30", createdAt: new Date(now.getTime() - 4 * DAY).toISOString() },
      { key: "67:2", createdAt: new Date(now.getTime() - 20 * DAY).toISOString() },
    ],
    recitations: [
      { id: "r1", at: new Date(now.getTime() - 1 * DAY).toISOString(), surah: 19, from: 23, to: 31, accuracy: 0.86, mistakes: 5, mastered: 6, needsReview: 3 },
      { id: "r2", at: new Date(now.getTime() - 3 * DAY).toISOString(), surah: 12, from: 15, to: 20, accuracy: 0.68, mistakes: 9, mastered: 2, needsReview: 4 },
      { id: "r3", at: new Date(now.getTime() - 5 * DAY).toISOString(), surah: 67, from: 1, to: 15, accuracy: 0.97, mistakes: 1, mastered: 15, needsReview: 0 },
    ],
    notifications: [
      {
        id: "n-goal",
        kind: "goal-complete",
        title: "أتممت سورة الملك",
        body: "ثبّتها الله في قلبك. ستظهر في مراجعاتك المتباعدة.",
        href: "/quran/67",
        createdAt: new Date(now.getTime() - 6 * DAY).toISOString(),
        read: true,
      },
    ],
    notificationPrefs: { ...DEFAULT_PREFS },
    goals: { dailyAyahs: 5, weeklyDays: 5, targetSurah: 19 },
  };
}
