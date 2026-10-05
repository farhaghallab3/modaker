/**
 * Pure reminder scheduling (unit-tested). Decides WHICH reminders are due for
 * a user at `now`, in the user's own time zone, honouring
 * NotificationPreferences: frequency / customDays, preferredTime window,
 * quiet hours. Reminder content comes from `derivedReminders` (shared with the
 * in-app UI) so push and in-app always say the same thing.
 */
import { derivedReminders } from "@/lib/store/selectors";
import type { UserState } from "@/lib/store/state";
import type { AppNotification, NotificationKind, NotificationPreferences } from "@/lib/types";

export interface LocalTime {
  /** YYYY-MM-DD in the user's zone */
  date: string;
  /** 0 = Sunday */
  weekday: number;
  /** minutes since local midnight */
  minutes: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * "weekdays" = Sunday–Thursday (the working week in most Arabic-speaking
 * countries, our primary audience). Users wanting Mon–Fri pick "custom".
 */
export const WORKING_DAYS = [0, 1, 2, 3, 4];

export function localTime(now: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAYS[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isDeliveryDay(prefs: NotificationPreferences, weekday: number): boolean {
  if (prefs.frequency === "daily") return true;
  if (prefs.frequency === "weekdays") return WORKING_DAYS.includes(weekday);
  return prefs.customDays.includes(weekday);
}

/** Quiet hours may wrap midnight (e.g. 22:00 → 06:00). */
export function inQuietHours(prefs: NotificationPreferences, minutes: number): boolean {
  if (!prefs.quietHours) return false;
  const from = hhmmToMinutes(prefs.quietHours.from);
  const to = hhmmToMinutes(prefs.quietHours.to);
  if (from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

/** True during [preferredTime, preferredTime + window). Handles wrap past midnight. */
export function inPreferredWindow(prefs: NotificationPreferences, minutes: number, windowMinutes: number): boolean {
  const start = hhmmToMinutes(prefs.preferredTime);
  const diff = (minutes - start + 1440) % 1440;
  return diff < windowMinutes;
}

export interface DueReminder {
  notification: AppNotification;
  /** Unique per user per local day — the Notification table enforces it. */
  dedupeKey: string;
}

export interface ComputeOptions {
  timeZone: string;
  /** Should be ≥ the cron interval. Duplicates are prevented by dedupeKey anyway. */
  windowMinutes?: number;
  /** Kinds already delivered today (optional pre-filter). */
  alreadySent?: Set<NotificationKind>;
}

const PUSHABLE: NotificationKind[] = ["welcome-back", "daily-wird", "review-due"];

export function computeDueReminders(state: UserState, now: Date, opts: ComputeOptions): DueReminder[] {
  const prefs = state.notificationPrefs;
  const t = localTime(now, opts.timeZone);
  if (!isDeliveryDay(prefs, t.weekday)) return [];
  if (inQuietHours(prefs, t.minutes)) return [];
  if (!inPreferredWindow(prefs, t.minutes, opts.windowMinutes ?? 30)) return [];

  return derivedReminders(state, now)
    .filter((n) => PUSHABLE.includes(n.kind) && !opts.alreadySent?.has(n.kind))
    .map((n) => ({
      dedupeKey: `${n.kind}:${t.date}`,
      notification: { ...n, id: `${n.kind}-${t.date}` },
    }));
}
