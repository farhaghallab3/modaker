"use client";

/**
 * Client application state. Screens read state + call intent-named actions;
 * persistence is delegated to a UserDataRepository (local demo or API).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildDemoState } from "@/content/demo-seed";
import { getSurahMeta } from "@/lib/quran/surahs";
import { declareMemorized } from "@/lib/review/learning";
import { weakOrigin } from "@/lib/review/self-review";
import type {
  AppNotification,
  AyahProgress,
  AyahRange,
  NotificationPreferences,
  RecitationAnalysis,
  ResumePoint,
  SelfGrade,
  UserProfile,
} from "@/lib/types";
import { createRepository, isApiMode } from "./repository";
import { applyMarkMemorized, applyRecitation, applySelfReviewRange } from "./reducers";
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
  /** Self-assessed review of a whole range (ثبتت / ترددت / نسيت). Never recitation evidence. */
  recordSelfReview(range: AyahRange, grade: SelfGrade): void;
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
        if (res?.ok) {
          // Real account: adopt the server's saved state. Never seed an empty state here —
          // the autosave effect would overwrite the user's stored progress with it.
          const user = (await res.json().catch(() => ({}))).user as { id?: string; email?: string } | undefined;
          const loaded = await repo.current.load().catch(() => null);
          if (!loaded && isApiMode()) throw new Error("تعذّر تحميل بياناتك. حاول مرة أخرى.");
          setState(loaded ?? { ...EMPTY_STATE, session: { userId: user?.id ?? uid("local"), email } });
          return;
        }
        update((s) => {
          if (s.session && s.profile?.email === email) return s; // same device account
          return { ...EMPTY_STATE, session: { userId: uid("local"), email } };
        });
      },
      async signOut() {
        await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
        // With a server account, drop the in-memory copy so the next person on this device never sees it.
        update((s) => (isApiMode() ? EMPTY_STATE : { ...s, session: null }));
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
            const key = `${input.currentSurah}:${a}`;
            progress[key] = declareMemorized(progress[key], input.currentSurah, a, now);
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
        update((s) => applyMarkMemorized(s, range));
      },
      recordRecitation(analysis) {
        update((s) => applyRecitation(s, analysis));
      },
      recordSelfReview(range, grade) {
        update((s) => applySelfReviewRange(s, range, grade).state);
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
          // An explicit request to review an ayah is a declaration that it is part of the learner's
          // memorization (the only way an ayah becomes memorized without a declaration elsewhere or
          // a good recitation). It is then due now and flagged weak so it tops the queue.
          const existing = declareMemorized(s.progress[key], surah, ayah);
          return {
            ...s,
            progress: {
              ...s.progress,
              // a learner-requested review has no recitation evidence behind it: weakness is "self" unless a confirmed one exists
              [key]: { ...existing, status: "weak", weakBy: weakOrigin(existing) === "recitation" ? "recitation" : "self", nextReviewAt: new Date().toISOString() },
            },
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
