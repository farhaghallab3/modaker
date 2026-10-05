/**
 * zod schemas for user data coming from clients (UserState, preferences).
 * Objects use .passthrough() at the top level so the UI can add fields to
 * UserState without a server release; the fields we project into relational
 * tables are validated strictly.
 */
import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDate = z.string().min(10).max(40);
const ayahKey = z.string().regex(/^\d{1,3}:\d{1,3}$/);

export const notificationPrefsSchema = z.object({
  dailyReminder: z.boolean(),
  reviewReminder: z.boolean(),
  preferredTime: hhmm,
  frequency: z.enum(["daily", "weekdays", "custom"]),
  customDays: z.array(z.number().int().min(0).max(6)).max(7),
  pushEnabled: z.boolean(),
  quietHours: z.object({ from: hhmm, to: hhmm }).optional(),
});

export const timeZoneSchema = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  });

export const ayahProgressSchema = z.object({
  key: ayahKey,
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  status: z.enum(["new", "learning", "memorized", "weak", "mastered"]),
  memorizedAt: isoDate.optional(),
  lastReviewedAt: isoDate.optional(),
  nextReviewAt: isoDate.optional(),
  ease: z.number().min(0).max(10),
  intervalDays: z.number().min(0).max(10_000),
  streak: z.number().int().min(0),
  successCount: z.number().int().min(0),
  mistakeCount: z.number().int().min(0),
  accuracy: z.number().min(0).max(1).optional(),
  recent: z
    .array(z.object({ at: isoDate, accuracy: z.number().min(0).max(1), mistakes: z.number().int().min(0), recId: z.string().max(64).optional() }))
    .max(10)
    .optional(),
});

export const profileSchema = z
  .object({
    id: z.string().max(64),
    name: z.string().max(80),
    email: z.string().max(254),
    level: z.enum(["beginner", "intermediate", "advanced"]),
    memorizedAmount: z.enum(["none", "juz-amma", "few-juz", "half", "most", "all"]),
    dailyTargetAyahs: z.number().int().min(1).max(300),
    reviewSessionsPerDay: z.number().int().min(0).max(20),
    reminderTime: hhmm,
    locale: z.enum(["ar", "en"]),
    createdAt: isoDate,
    onboarded: z.boolean(),
    timeZone: timeZoneSchema.optional(),
  })
  .passthrough();

export const userStateSchema = z
  .object({
    version: z.literal(1),
    demo: z.boolean(),
    session: z.unknown().optional(),
    profile: profileSchema.nullable(),
    progress: z.record(ayahKey, ayahProgressSchema).refine((r) => Object.keys(r).length <= 6236),
    resume: z
      .object({
        surah: z.number().int().min(1).max(114),
        ayah: z.number().int().min(1).max(286),
        mode: z.enum(["memorize", "recite", "read"]),
        updatedAt: isoDate,
      })
      .nullable(),
    activity: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          memorized: z.number().int().min(0),
          reviewed: z.number().int().min(0),
          recitations: z.number().int().min(0),
        }),
      )
      .max(3660),
    bookmarks: z.array(z.object({ key: ayahKey, createdAt: isoDate, note: z.string().max(1000).optional() })).max(5000),
    recitations: z.array(z.unknown()).max(1000),
    notifications: z.array(z.unknown()).max(500),
    notificationPrefs: notificationPrefsSchema,
    goals: z
      .object({
        dailyAyahs: z.number().int().min(1).max(300),
        weeklyDays: z.number().int().min(1).max(7),
        targetSurah: z.number().int().min(1).max(114).optional(),
        targetDate: z.string().max(40).optional(),
      })
      .passthrough(),
    privacy: z.object({ keepRecordings: z.boolean(), retentionDays: z.number().int().min(0).max(365) }).passthrough(),
  })
  .passthrough();

export type ValidatedUserState = z.infer<typeof userStateSchema>;
