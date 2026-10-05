"use client";

/**
 * Client application state. Screens read state + call intent-named actions;
 * persistence is delegated to a UserDataRepository (local demo or API).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildDemoState } from "@/content/demo-seed";
import { getSurahMeta } from "@/lib/quran/surahs";
import { applyReview, newAyahProgress } from "@/lib/review/scheduler";
import type {
  AppNotification,
  AyahProgress,
  AyahRange,
  NotificationPreferences,
  RecitationAnalysis,
  ResumePoint,
  UserProfile,
} from "@/lib/types";
import { createRepository } from "./repository";
import { EMPTY_STATE, todayKey, uid, type Goals, type PrivacySettings, type UserState } from "./state";

export interface OnboardingInput {
  name?: string;
  memorizedAmount: UserProfile["memorizedAmount"];
  currentSurah: number;
  stoppedAt: number; // the ayah where they stopped (next to memorize)
  dailyTargetAyahs: number;
  reminderTime: string;
  reviewSessionsPerDay: number;
  level: UserProfile["level"];
}

interface Actions {
  register(input: { name: string; email: string; password: string }): Promise<void>;
  signIn(input: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
  startDemo(): void;
  completeOnboarding(input: OnboardingInput): void;
  markMemorized(range: AyahRange): void;
  recordRecitation(analysis: RecitationAnalysis): void;
  setResume(point: Omit<ResumePoint, "updatedAt">): void;
  toggleBookmark(key: string): void;
  addToReview(key: string): void;
  markNotificationRead(id: string): void;
  markAllNotificationsRead(): void;
  updatePrefs(p: Partial<NotificationPreferences>): void;
  updateProfile(p: Partial<UserProfile>): void;
  updateGoals(g: Partial<Goals>): void;
  updatePrivacy(p: Partial<PrivacySettings>): void;
  deleteAllData(): Promise<void>;
}

interface Ctx {
  state: UserState;
  ready: boolean;
  actions: Actions;
}

const AppContext = createContext<Ctx | null>(null);

function bumpActivity(s: UserState, field: "memorized" | "reviewed" | "recitations", n: number): UserState["activity"] {
  const k = todayKey();
  const exists = s.activity.some((a) => a.date === k);
  const base = exists ? s.activity : [...s.activity, { date: k, memorized: 0, reviewed: 0, recitations: 0 }];
  return base.map((a) => (a.date === k ? { ...a, [field]: a[field] + n } : a));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const repo = useRef(createRepository());
  const [state, setState] = useState<UserState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    repo.current
      .load()
      .then((s) => {
        if (alive && s) setState(s);
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // persist after every change once loaded
  useEffect(() => {
    if (ready) void repo.current.save(state);
  }, [state, ready]);

  const update = useCallback((fn: (s: UserState) => UserState) => setState((s) => fn(s)), []);

  const actions = useMemo<Actions>(
    () => ({
      async register({ name, email, password }) {
        // Real API first; fall back to a device-only account when no backend is configured.
        const res = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        }).catch(() => null);
        if (res && !res.ok && res.status !== 503 && res.status !== 404) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "تعذّر إنشاء الحساب");
        }
        const userId = res?.ok ? ((await res.json()).user?.id ?? uid("u")) : uid("local");
        update(() => ({
          ...EMPTY_STATE,
          session: { userId, email },
          profile: {
            id: userId,
            name,
            email,
            level: "beginner",
            memorizedAmount: "none",
            dailyTargetAyahs: 5,
            reviewSessionsPerDay: 2,
            reminderTime: "05:30",
            locale: "ar",
            createdAt: new Date().toISOString(),
            onboarded: false,
          },
        }));
      },
      async signIn({ email, password }) {
        const res = await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        }).catch(() => null);
        if (res && res.status === 401) throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
        update((s) => {
          if (s.session && s.profile?.email === email) return s; // same device account
          return { ...EMPTY_STATE, session: { userId: uid("local"), email } };
        });
      },
      async signOut() {
        await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
        update((s) => ({ ...s, session: null }));
      },
      startDemo() {
        setState(buildDemoState());
      },
      completeOnboarding(input) {
        update((s) => {
          const now = new Date();
          const progress: Record<string, AyahProgress> = { ...s.progress };
          // ayahs before the stopping point are treated as memorized and enter review
          for (let a = 1; a < input.stoppedAt; a++) {
            const p = newAyahProgress(input.currentSurah, a, now);
            progress[p.key] = progress[p.key] ?? p;
          }
          const profile: UserProfile = {
            ...(s.profile ?? {
              id: s.session?.userId ?? uid("u"),
              email: s.session?.email ?? "",
              createdAt: now.toISOString(),
              locale: "ar",
            }),
            name: input.name || s.profile?.name || "",
            level: input.level,
            memorizedAmount: input.memorizedAmount,
            dailyTargetAyahs: input.dailyTargetAyahs,
            reminderTime: input.reminderTime,
            reviewSessionsPerDay: input.reviewSessionsPerDay,
            onboarded: true,
          } as UserProfile;
          return {
            ...s,
            profile,
            progress,
            resume: { surah: input.currentSurah, ayah: input.stoppedAt, mode: "memorize", updatedAt: now.toISOString() },
            goals: { ...s.goals, dailyAyahs: input.dailyTargetAyahs, targetSurah: input.currentSurah },
            notificationPrefs: { ...s.notificationPrefs, preferredTime: input.reminderTime },
          };
        });
      },
      markMemorized(range) {
        update((s) => {
          const now = new Date();
          const progress = { ...s.progress };
          let added = 0;
          for (let a = range.from; a <= range.to; a++) {
            const key = `${range.surah}:${a}`;
            if (!progress[key] || progress[key].status === "new" || progress[key].status === "learning") {
              progress[key] = newAyahProgress(range.surah, a, now);
              added++;
            }
          }
          const meta = getSurahMeta(range.surah);
          const nextAyah = meta && range.to < meta.ayahCount ? range.to + 1 : range.to;
          const resume =
            !s.resume || s.resume.surah !== range.surah || s.resume.ayah <= range.to
              ? { surah: range.surah, ayah: nextAyah, mode: "memorize" as const, updatedAt: now.toISOString() }
              : s.resume;
          const notifications = [...s.notifications];
          if (meta && Object.values(progress).filter((p) => p.surah === range.surah).length >= meta.ayahCount) {
            notifications.unshift({
              id: uid("n"),
              kind: "goal-complete",
              title: `أتممت سورة ${meta.nameAr}`,
              body: "ثبّتها الله في قلبك. ستنتقل إلى مراجعاتك المتباعدة.",
              href: `/quran/${meta.number}`,
              createdAt: now.toISOString(),
              read: false,
            });
          }
          return { ...s, progress, resume, notifications, activity: bumpActivity(s, "memorized", added) };
        });
      },
      recordRecitation(analysis) {
        update((s) => {
          const now = new Date();
          const progress = { ...s.progress };
          for (const r of analysis.ayahs) {
            const [surah, ayah] = r.key.split(":").map(Number);
            const base = progress[r.key] ?? newAyahProgress(surah, ayah, now);
            const mistakes = r.mistakes.filter((m) => m.type !== "hesitation").length;
            progress[r.key] = applyReview(base, { accuracy: r.accuracy, mistakes }, now);
          }
          const { surah, from, to } = analysis.range;
          const summary = {
            id: uid("rec"),
            at: now.toISOString(),
            surah,
            from,
            to,
            accuracy: analysis.accuracy,
            mistakes: analysis.mistakes.length,
            mastered: analysis.ayahs.filter((a) => a.status === "mastered").length,
            needsReview: analysis.ayahs.filter((a) => a.status !== "mastered").length,
          };
          return {
            ...s,
            progress,
            recitations: [summary, ...s.recitations].slice(0, 100),
            activity: bumpActivity({ ...s, activity: bumpActivity(s, "recitations", 1) }, "reviewed", analysis.ayahs.length),
          };
        });
      },
      setResume(point) {
        update((s) => ({ ...s, resume: { ...point, updatedAt: new Date().toISOString() } }));
      },
      toggleBookmark(key) {
        update((s) => ({
          ...s,
          bookmarks: s.bookmarks.some((b) => b.key === key)
            ? s.bookmarks.filter((b) => b.key !== key)
            : [{ key, createdAt: new Date().toISOString() }, ...s.bookmarks],
        }));
      },
      addToReview(key) {
        update((s) => {
          const [surah, ayah] = key.split(":").map(Number);
          const existing = s.progress[key] ?? newAyahProgress(surah, ayah);
          // due now, flagged weak so it surfaces at the top of the queue
          return {
            ...s,
            progress: { ...s.progress, [key]: { ...existing, status: "weak", nextReviewAt: new Date().toISOString() } },
          };
        });
      },
      markNotificationRead(id) {
        update((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
      },
      markAllNotificationsRead() {
        update((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
      },
      updatePrefs(p) {
        update((s) => ({ ...s, notificationPrefs: { ...s.notificationPrefs, ...p } }));
      },
      updateProfile(p) {
        update((s) => (s.profile ? { ...s, profile: { ...s.profile, ...p } } : s));
      },
      updateGoals(g) {
        update((s) => ({ ...s, goals: { ...s.goals, ...g } }));
      },
      updatePrivacy(p) {
        update((s) => ({ ...s, privacy: { ...s.privacy, ...p } }));
      },
      async deleteAllData() {
        await repo.current.clear();
        await fetch("/api/v1/me", { method: "DELETE" }).catch(() => null);
        setState(EMPTY_STATE);
      },
    }),
    [update],
  );

  const value = useMemo(() => ({ state, ready, actions }), [state, ready, actions]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export type { AppNotification };
