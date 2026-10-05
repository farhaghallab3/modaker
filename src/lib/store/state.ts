import type {
  AppNotification,
  AyahProgress,
  Bookmark,
  DailyActivity,
  NotificationPreferences,
  ResumePoint,
  UserProfile,
} from "@/lib/types";

export interface RecitationSummary {
  id: string;
  at: string;
  surah: number;
  from: number;
  to: number;
  accuracy: number;
  mistakes: number;
  mastered: number;
  needsReview: number;
  /** ayahs we could not judge (recognizer doubt) — nothing was scored against the learner */
  uncertain?: number;
}

export interface Goals {
  dailyAyahs: number;
  weeklyDays: number;
  /** optional milestone, e.g. finish Surah Maryam */
  targetSurah?: number;
  targetDate?: string;
}

export interface PrivacySettings {
  /** keep raw audio after transcription (off by default) */
  keepRecordings: boolean;
  retentionDays: number;
}

export interface UserState {
  version: 1;
  /** true while showing seeded demo data — the UI labels it */
  demo: boolean;
  session: { userId: string; email: string } | null;
  profile: UserProfile | null;
  progress: Record<string, AyahProgress>;
  resume: ResumePoint | null;
  activity: DailyActivity[];
  bookmarks: Bookmark[];
  recitations: RecitationSummary[];
  notifications: AppNotification[];
  notificationPrefs: NotificationPreferences;
  goals: Goals;
  privacy: PrivacySettings;
}

export const DEFAULT_PREFS: NotificationPreferences = {
  dailyReminder: true,
  reviewReminder: true,
  preferredTime: "05:30",
  frequency: "daily",
  customDays: [0, 1, 2, 3, 4, 5, 6],
  pushEnabled: false,
};

export const EMPTY_STATE: UserState = {
  version: 1,
  demo: false,
  session: null,
  profile: null,
  progress: {},
  resume: null,
  activity: [],
  bookmarks: [],
  recitations: [],
  notifications: [],
  notificationPrefs: DEFAULT_PREFS,
  goals: { dailyAyahs: 5, weeklyDays: 5 },
  privacy: { keepRecordings: false, retentionDays: 0 },
};

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function uid(prefix = "id"): string {
  const r =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${r}`;
}
