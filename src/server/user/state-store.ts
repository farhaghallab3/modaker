/**
 * Persistence for /api/v1/me/state.
 *
 * Strategy (documented in docs/ARCHITECTURE-backend.md §1):
 *  - UserStateSnapshot (jsonb) holds the client's full UserState document and
 *    is the source of truth for GET — the client works offline-first and syncs
 *    the whole document, so a snapshot avoids lossy round-trips.
 *  - On every PUT the snapshot is ALSO projected, in the same transaction, into
 *    relational tables (UserProfile, MemorizationProgress, ResumePoint,
 *    DailyActivity, Bookmark, MemorizationGoal, NotificationPreference) which
 *    power server-side features: reminder cron, analytics, indexes on
 *    nextReviewAt, and future mobile clients that read granular endpoints.
 */
import type { Prisma } from "@prisma/client";
import { DEFAULT_PREFS, EMPTY_STATE, type UserState } from "@/lib/store/state";
import type { NotificationPreferences } from "@/lib/types";
import { getPrisma } from "../db";
import { env } from "../env";
import { toDbEnum } from "./mappers";
import type { ValidatedUserState } from "./schema";

const date = (s?: string) => (s ? new Date(s) : null);

export async function loadUserState(userId: string): Promise<UserState> {
  const prisma = await getPrisma();
  const [user, snap] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }),
    prisma.userStateSnapshot.findUnique({ where: { userId } }),
  ]);
  if (!user) throw new Error("user not found");
  const data = (snap?.data as unknown as UserState | undefined) ?? EMPTY_STATE;
  // The session block always reflects the server's view of who is signed in.
  return { ...EMPTY_STATE, ...data, session: { userId: user.id, email: user.email }, demo: data.demo ?? false };
}

export async function saveUserState(userId: string, state: ValidatedUserState, timeZone?: string): Promise<void> {
  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new Error("user not found");

  const doc = { ...state, session: { userId, email: user.email } };
  const tz = timeZone ?? (state.profile?.timeZone as string | undefined);

  await prisma.$transaction(
    async (tx) => {
      await tx.userStateSnapshot.upsert({
        where: { userId },
        create: { userId, version: 1, data: doc as unknown as Prisma.InputJsonValue },
        update: { version: 1, data: doc as unknown as Prisma.InputJsonValue },
      });

      if (state.profile) {
        const p = state.profile;
        const profileData = {
          name: p.name,
          level: p.level,
          memorizedAmount: toDbEnum(p.memorizedAmount) as never,
          dailyTargetAyahs: p.dailyTargetAyahs,
          reviewSessionsPerDay: p.reviewSessionsPerDay,
          reminderTime: p.reminderTime,
          locale: p.locale,
          onboarded: p.onboarded,
          keepRecordings: state.privacy.keepRecordings,
          ...(tz ? { timeZone: tz } : {}),
        };
        await tx.userProfile.upsert({ where: { userId }, create: { userId, ...profileData }, update: profileData });
      }

      // Progress: replace wholesale (≤ 6236 rows; createMany is a single statement).
      await tx.memorizationProgress.deleteMany({ where: { userId } });
      const progress = Object.values(state.progress);
      if (progress.length) {
        await tx.memorizationProgress.createMany({
          data: progress.map((p) => ({
            userId,
            surah: p.surah,
            ayah: p.ayah,
            status: p.status,
            ease: p.ease,
            intervalDays: p.intervalDays,
            streak: p.streak,
            successCount: p.successCount,
            mistakeCount: p.mistakeCount,
            accuracy: p.accuracy ?? null,
            memorizedAt: date(p.memorizedAt),
            lastReviewedAt: date(p.lastReviewedAt),
            nextReviewAt: date(p.nextReviewAt),
          })),
          skipDuplicates: true,
        });
      }

      if (state.resume) {
        const r = { surah: state.resume.surah, ayah: state.resume.ayah, mode: state.resume.mode };
        await tx.resumePoint.upsert({ where: { userId }, create: { userId, ...r }, update: r });
      } else {
        await tx.resumePoint.deleteMany({ where: { userId } });
      }

      await tx.dailyActivity.deleteMany({ where: { userId } });
      if (state.activity.length) {
        await tx.dailyActivity.createMany({ data: state.activity.map((a) => ({ userId, ...a })), skipDuplicates: true });
      }

      await tx.bookmark.deleteMany({ where: { userId } });
      if (state.bookmarks.length) {
        await tx.bookmark.createMany({
          data: state.bookmarks.map((b) => {
            const [surah, ayah] = b.key.split(":").map(Number);
            return { userId, key: b.key, surah, ayah, note: b.note ?? null, createdAt: new Date(b.createdAt) };
          }),
          skipDuplicates: true,
        });
      }

      const g = state.goals;
      const goalData = {
        dailyAyahs: g.dailyAyahs,
        weeklyDays: g.weeklyDays,
        targetSurah: g.targetSurah ?? null,
        targetDate: g.targetDate ? new Date(g.targetDate) : null,
      };
      const active = await tx.memorizationGoal.findFirst({ where: { userId, active: true } });
      if (active) await tx.memorizationGoal.update({ where: { id: active.id }, data: goalData });
      else await tx.memorizationGoal.create({ data: { userId, active: true, ...goalData } });

      await upsertPrefs(tx, userId, state.notificationPrefs, tz);
    },
    { timeout: 20_000 },
  );
}

type Tx = Prisma.TransactionClient;

async function upsertPrefs(tx: Tx, userId: string, p: NotificationPreferences, tz?: string) {
  const data = {
    dailyReminder: p.dailyReminder,
    reviewReminder: p.reviewReminder,
    preferredTime: p.preferredTime,
    frequency: p.frequency,
    customDays: p.customDays,
    pushEnabled: p.pushEnabled,
    quietFrom: p.quietHours?.from ?? null,
    quietTo: p.quietHours?.to ?? null,
    ...(tz ? { timeZone: tz } : {}),
  };
  await tx.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

/** Clears progress data but keeps the account (DELETE /me/state). */
export async function clearUserState(userId: string): Promise<void> {
  const prisma = await getPrisma();
  await prisma.$transaction([
    prisma.userStateSnapshot.deleteMany({ where: { userId } }),
    prisma.memorizationProgress.deleteMany({ where: { userId } }),
    prisma.resumePoint.deleteMany({ where: { userId } }),
    prisma.dailyActivity.deleteMany({ where: { userId } }),
    prisma.bookmark.deleteMany({ where: { userId } }),
    prisma.memorizationGoal.deleteMany({ where: { userId } }),
    prisma.memorizationSession.deleteMany({ where: { userId } }),
    prisma.reviewSchedule.deleteMany({ where: { userId } }),
    prisma.reviewAttempt.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
  ]);
}

// ── Notification preferences (GET/PUT /notifications/preferences) ────────

export interface StoredPreferences extends NotificationPreferences {
  timeZone: string;
}

export async function loadPreferences(userId: string): Promise<StoredPreferences> {
  const prisma = await getPrisma();
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_PREFS, timeZone: env.defaultTimeZone() };
  return {
    dailyReminder: row.dailyReminder,
    reviewReminder: row.reviewReminder,
    preferredTime: row.preferredTime,
    frequency: row.frequency,
    customDays: row.customDays,
    pushEnabled: row.pushEnabled,
    quietHours: row.quietFrom && row.quietTo ? { from: row.quietFrom, to: row.quietTo } : undefined,
    timeZone: row.timeZone,
  };
}

export async function savePreferences(userId: string, prefs: NotificationPreferences, timeZone?: string): Promise<StoredPreferences> {
  const prisma = await getPrisma();
  await prisma.$transaction(async (tx) => {
    await upsertPrefs(tx, userId, prefs, timeZone);
    // Keep the snapshot in sync so GET /me/state returns the same prefs.
    const snap = await tx.userStateSnapshot.findUnique({ where: { userId } });
    if (snap) {
      const data = { ...(snap.data as object), notificationPrefs: prefs };
      await tx.userStateSnapshot.update({ where: { userId }, data: { data: data as unknown as Prisma.InputJsonValue } });
    }
  });
  return loadPreferences(userId);
}
