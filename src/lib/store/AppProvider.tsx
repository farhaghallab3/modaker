"use client";

/**
 * Client application state. Screens read state + call intent-named actions;
 * persistence is delegated to a UserDataRepository (local demo or API).
 *
 * Who is signed in comes from Clerk (Google + email): <ClerkBridge> reports the Clerk user and
 * the provider switches `state` to that account's progress. Without Clerk keys nobody can sign in.
 */
import { useClerk, useUser } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { buildDemoState } from "@/content/demo-seed";
import { clerkEnabled } from "@/lib/auth/clerk-config";
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
import { loadDeviceState, removeDeviceAccount, saveDeviceAccountState } from "./device-accounts";
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

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthSnapshot {
  /** false until Clerk has said whether someone is signed in. */
  loaded: boolean;
  user: AuthUser | null;
}

function newProfile(u: AuthUser): UserProfile {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    level: "beginner",
    memorizedAmount: "none",
    dailyTargetAyahs: 5,
    reviewSessionsPerDay: 2,
    reminderTime: "05:30",
    locale: "ar",
    createdAt: new Date().toISOString(),
    onboarded: false,
  };
}

/** Reports the Clerk user to the provider, and hands it Clerk's sign-out. */
function ClerkBridge({
  onChange,
  signOutRef,
}: {
  onChange: (a: AuthSnapshot) => void;
  signOutRef: MutableRefObject<(() => Promise<void>) | null>;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  signOutRef.current = () => clerk.signOut();
  const email = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? "";
  const name = user?.fullName?.trim() || user?.firstName?.trim() || "";
  const id = user?.id ?? "";
  useEffect(() => {
    if (!isLoaded) return;
    onChange({ loaded: true, user: isSignedIn && id && email ? { id, email, name } : null });
  }, [isLoaded, isSignedIn, id, email, name, onChange]);
  return null;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const repo = useRef(createRepository());
  const [state, setState] = useState<UserState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [auth, setAuth] = useState<AuthSnapshot>({ loaded: !clerkEnabled, user: null });
  const clerkSignOut = useRef<(() => Promise<void>) | null>(null);
  /** The account (email, or null when signed out) whose progress `state` currently reflects. */
  const [syncedFor, setSyncedFor] = useState<string | null | undefined>(undefined);
  // Ready only once the state belongs to whoever Clerk says is signed in — otherwise route guards
  // would briefly see "signed out" right after a sign-in and bounce the user back to /login.
  const ready = loaded && auth.loaded && syncedFor === (auth.user?.email ?? null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let alive = true;
    repo.current
      .load()
      .then((s) => {
        if (alive && s) setState(s);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  // Follow Clerk: switch to the signed-in account's progress, or sign the account out locally.
  useEffect(() => {
    if (!loaded || !auth.loaded) return;
    const u = auth.user;
    if (u && isApiMode()) {
      if (stateRef.current.session?.email === u.email && !stateRef.current.demo) {
        setSyncedFor(u.email);
        return;
      }
      // Progress lives on the server (identified by Clerk). Never seed an empty state over it.
      repo.current
        .load()
        .then((s) => s && setState({ ...s, demo: false, profile: s.profile ?? newProfile(u) }))
        .catch(() => {})
        .finally(() => setSyncedFor(u.email));
      return;
    }
    setState((s) => {
      if (u) {
        if (!s.demo && s.session?.email === u.email) return s; // already this account
        const saved = loadDeviceState(u.email);
        const base = saved ?? (!s.demo && s.profile?.email === u.email ? s : EMPTY_STATE);
        return {
          ...base,
          demo: false,
          session: { userId: u.id, email: u.email },
          profile: base.profile ? { ...base.profile, email: u.email } : newProfile(u),
        };
      }
      // Signed out: drop the account's session; the demo stays usable.
      if (s.session && !s.demo) return isApiMode() ? EMPTY_STATE : { ...s, session: null };
      return s;
    });
    setSyncedFor(u?.email ?? null);
  }, [loaded, auth]);

  // persist after every change once loaded
  useEffect(() => {
    if (!ready) return;
    if (isApiMode() && !state.session) return; // nothing to save to while signed out
    void repo.current.save(state);
    if (!isApiMode()) saveDeviceAccountState(state); // each device account keeps its own copy
  }, [state, ready]);

  const update = useCallback((fn: (s: UserState) => UserState) => setState((s) => fn(s)), []);

  const actions = useMemo<Actions>(
    () => ({
      async signOut() {
        await clerkSignOut.current?.().catch(() => null);
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
        const email = stateRef.current.session?.email;
        await repo.current.clear();
        await fetch("/api/v1/me", { method: "DELETE" }).catch(() => null);
        if (email) removeDeviceAccount(email);
        await clerkSignOut.current?.().catch(() => null);
        setState(EMPTY_STATE);
      },
    }),
    [update],
  );

  const value = useMemo(() => ({ state, ready, actions }), [state, ready, actions]);
  return (
    <AppContext.Provider value={value}>
      {clerkEnabled ? <ClerkBridge onChange={setAuth} signOutRef={clerkSignOut} /> : null}
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export type { AppNotification };
