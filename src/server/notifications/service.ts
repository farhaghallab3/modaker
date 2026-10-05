/**
 * NotificationService: fans a notification out to channels, respecting the
 * user's preferences, and runs the periodic reminder sweep (cron).
 *
 *   in-app (always, also the dedupe record) → web push / native push (if pushEnabled)
 */
import { EMPTY_STATE, type UserState } from "@/lib/store/state";
import type { AppNotification, NotificationPreferences } from "@/lib/types";
import { getPrisma } from "../db";
import type { ChannelResult, NotificationChannel } from "./channel";
import { InAppChannel } from "./in-app";
import { MobilePushChannel } from "./mobile";
import { computeDueReminders } from "./schedule";
import { WebPushChannel } from "./web-push";

export { computeDueReminders } from "./schedule";

export interface SweepStats {
  usersScanned: number;
  remindersCreated: number;
  pushDelivered: number;
  duplicates: number;
  errors: number;
}

export class NotificationService {
  constructor(
    private inApp: InAppChannel = new InAppChannel(),
    private push: NotificationChannel[] = [new WebPushChannel(), new MobilePushChannel()],
  ) {}

  /** Deliver one notification. Returns per-channel results. */
  async deliver(userId: string, n: AppNotification, prefs: Pick<NotificationPreferences, "pushEnabled">, dedupeKey?: string): Promise<ChannelResult[]> {
    const first = await this.inApp.send(userId, n, { dedupeKey });
    if (first.duplicate) return [first];
    const results: ChannelResult[] = [first];
    if (prefs.pushEnabled) {
      for (const ch of this.push) {
        try {
          results.push(await ch.send(userId, n));
        } catch (e) {
          results.push({ channel: ch.id, delivered: 0, error: (e as Error).message });
        }
      }
      const via = results.filter((r) => r.channel !== this.inApp.id && r.delivered > 0).map((r) => r.channel);
      if (via.length && dedupeKey) await this.inApp.markDelivered(userId, dedupeKey, via).catch(() => undefined);
    }
    return results;
  }

  /**
   * Scan users with reminders enabled and deliver what is due now.
   * Safe to run as often as every 5–15 minutes: dedupe keys make it idempotent.
   */
  async runReminderSweep(now = new Date(), opts: { windowMinutes?: number; batchSize?: number } = {}): Promise<SweepStats> {
    const prisma = await getPrisma();
    const stats: SweepStats = { usersScanned: 0, remindersCreated: 0, pushDelivered: 0, duplicates: 0, errors: 0 };
    const take = opts.batchSize ?? 100;
    let cursor: string | undefined;

    for (;;) {
      const prefsRows = await prisma.notificationPreference.findMany({
        where: { OR: [{ dailyReminder: true }, { reviewReminder: true }] },
        orderBy: { userId: "asc" },
        take,
        ...(cursor ? { skip: 1, cursor: { userId: cursor } } : {}),
      });
      if (!prefsRows.length) break;
      cursor = prefsRows[prefsRows.length - 1].userId;

      const snaps = await prisma.userStateSnapshot.findMany({ where: { userId: { in: prefsRows.map((p) => p.userId) } } });
      const byUser = new Map(snaps.map((s) => [s.userId, s.data as unknown as UserState]));

      for (const row of prefsRows) {
        stats.usersScanned++;
        try {
          const prefs: NotificationPreferences = {
            dailyReminder: row.dailyReminder,
            reviewReminder: row.reviewReminder,
            preferredTime: row.preferredTime,
            frequency: row.frequency,
            customDays: row.customDays,
            pushEnabled: row.pushEnabled,
            quietHours: row.quietFrom && row.quietTo ? { from: row.quietFrom, to: row.quietTo } : undefined,
          };
          const state: UserState = { ...EMPTY_STATE, ...(byUser.get(row.userId) ?? {}), notificationPrefs: prefs };
          const due = computeDueReminders(state, now, { timeZone: row.timeZone, windowMinutes: opts.windowMinutes });
          for (const d of due) {
            const results = await this.deliver(row.userId, d.notification, prefs, d.dedupeKey);
            if (results[0].duplicate) stats.duplicates++;
            else stats.remindersCreated++;
            stats.pushDelivered += results.slice(1).reduce((n, r) => n + r.delivered, 0);
          }
        } catch (e) {
          stats.errors++;
          console.error(`[notifications] sweep failed for user ${row.userId}:`, (e as Error).message);
        }
      }
      if (prefsRows.length < take) break;
    }
    return stats;
  }
}

let service: NotificationService | null = null;
export function getNotificationService(): NotificationService {
  return (service ??= new NotificationService());
}
