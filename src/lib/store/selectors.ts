import { getSurahMeta, SURAHS, toArabicDigits } from "@/lib/quran/surahs";
import { buildReviewQueue } from "@/lib/review/scheduler";
import type { AppNotification, AyahProgress, ReviewItem } from "@/lib/types";
import { todayKey, type UserState } from "./state";

const DAY = 86_400_000;

export function progressList(s: UserState): AyahProgress[] {
  return Object.values(s.progress);
}

export function memorizedCount(s: UserState): number {
  return progressList(s).filter((p) => p.status !== "new" && p.status !== "learning").length;
}

export function surahProgress(s: UserState, surah: number): { memorized: number; total: number; ratio: number } {
  const total = getSurahMeta(surah)?.ayahCount ?? 0;
  const memorized = progressList(s).filter((p) => p.surah === surah && p.status !== "new" && p.status !== "learning").length;
  return { memorized, total, ratio: total ? memorized / total : 0 };
}

export function completedSurahs(s: UserState): number {
  return SURAHS.filter((m) => surahProgress(s, m.number).ratio >= 1).length;
}

export function surahsInProgress(s: UserState): number[] {
  const set = new Set(progressList(s).map((p) => p.surah));
  return [...set].sort((a, b) => a - b);
}

/** Consecutive days (ending today or yesterday) with any activity. */
export function streakDays(s: UserState, now = new Date()): number {
  const active = new Set(s.activity.filter((a) => a.memorized + a.reviewed + a.recitations > 0).map((a) => a.date));
  let d = new Date(now);
  if (!active.has(todayKey(d))) d = new Date(d.getTime() - DAY); // today not done yet — streak still alive
  let n = 0;
  while (active.has(todayKey(d))) {
    n++;
    d = new Date(d.getTime() - DAY);
  }
  return n;
}

export function lastNDays(s: UserState, n = 7, now = new Date()) {
  const map = new Map(s.activity.map((a) => [a.date, a]));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() - (n - 1 - i) * DAY);
    const k = todayKey(d);
    const a = map.get(k);
    return {
      date: k,
      weekday: d.toLocaleDateString("ar", { weekday: "short" }),
      memorized: a?.memorized ?? 0,
      reviewed: a?.reviewed ?? 0,
      recitations: a?.recitations ?? 0,
      isToday: i === n - 1,
    };
  });
}

export function averageAccuracy(s: UserState): number | null {
  const accs = progressList(s)
    .map((p) => p.accuracy)
    .filter((a): a is number => a != null);
  if (!accs.length) return null;
  return accs.reduce((a, b) => a + b, 0) / accs.length;
}

export function weakAyahs(s: UserState): AyahProgress[] {
  return progressList(s)
    .filter((p) => p.status === "weak" || (p.accuracy != null && p.accuracy < 0.75))
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1));
}

export function strongAyahs(s: UserState): AyahProgress[] {
  return progressList(s).filter((p) => p.status === "mastered");
}

export function reviewQueue(s: UserState, now = new Date()): ReviewItem[] {
  return buildReviewQueue(progressList(s), now);
}

export function today(s: UserState, now = new Date()) {
  return s.activity.find((a) => a.date === todayKey(now)) ?? { date: todayKey(now), memorized: 0, reviewed: 0, recitations: 0 };
}

/** Today's new-memorization portion: next `dailyAyahs` from the resume point. */
export function todaysWird(s: UserState): { surah: number; from: number; to: number } | null {
  if (!s.resume) return null;
  const meta = getSurahMeta(s.resume.surah);
  if (!meta) return null;
  const target = s.profile?.dailyTargetAyahs ?? s.goals.dailyAyahs;
  const from = s.resume.ayah;
  const to = Math.min(meta.ayahCount, from + target - 1);
  return { surah: meta.number, from, to };
}

export function weeklyConsistency(s: UserState, now = new Date()): number {
  const days = lastNDays(s, 7, now);
  return days.filter((d) => d.memorized + d.reviewed + d.recitations > 0).length / 7;
}

/**
 * In-app reminders derived from state. The server-side NotificationService
 * produces the same kinds for push delivery (src/server/notifications).
 */
export function derivedReminders(s: UserState, now = new Date()): AppNotification[] {
  const out: AppNotification[] = [];
  const t = today(s, now);
  const queue = reviewQueue(s, now).filter((r) => r.bucket === "today" || r.bucket === "weak");
  const resume = s.resume;
  const lastActive = s.activity.filter((a) => a.memorized + a.reviewed + a.recitations > 0).map((a) => a.date).sort().pop();
  const iso = now.toISOString();

  if (resume && lastActive && (now.getTime() - new Date(lastActive).getTime()) / DAY >= 2) {
    const m = getSurahMeta(resume.surah);
    out.push({
      id: "derived-welcome",
      kind: "welcome-back",
      title: "أهلًا بعودتك",
      body: `توقفت عند سورة ${m?.nameAr} — الآية ${toArabicDigits(resume.ayah)}.`,
      href: `/memorize/${resume.surah}?from=${resume.ayah}`,
      createdAt: iso,
      read: false,
    });
  }
  if (s.notificationPrefs.dailyReminder && t.memorized === 0 && resume) {
    out.push({
      id: "derived-wird",
      kind: "daily-wird",
      title: "وردك ينتظرك 🌿",
      body: "لم تحفظ ورد اليوم بعد.",
      href: `/memorize/${resume.surah}?from=${resume.ayah}`,
      createdAt: iso,
      read: false,
    });
  }
  if (s.notificationPrefs.reviewReminder && queue.length) {
    const first = queue[0];
    out.push({
      id: "derived-review",
      kind: "review-due",
      title: "حان وقت المراجعة",
      body: `حان وقت مراجعة سورة ${getSurahMeta(first.surah)?.nameAr}${queue.length > 1 ? ` و${toArabicDigits(queue.length - 1)} ${queue.length - 1 === 1 ? "مقطع آخر" : queue.length - 1 === 2 ? "مقطعان آخران" : queue.length - 1 <= 10 ? "مقاطع أخرى" : "مقطعًا آخر"}` : ""}.`,
      href: "/review",
      createdAt: iso,
      read: false,
    });
  }
  return out;
}
