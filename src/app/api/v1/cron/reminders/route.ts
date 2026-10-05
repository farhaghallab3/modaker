/**
 * POST|GET /api/v1/cron/reminders   Authorization: Bearer $CRON_SECRET
 * Run every 15 minutes (Vercel Cron, GitHub Actions, or system cron + curl).
 *  1. sends due reminders (idempotent per user/kind/local day)
 *  2. purges voice recordings past their retention
 *  3. deletes expired sessions
 */
import { timingSafeEqual } from "node:crypto";
import { getPrisma } from "@/server/db";
import { env } from "@/server/env";
import { apiError } from "@/server/errors";
import { json, route } from "@/server/http";
import { getNotificationService } from "@/server/notifications/service";
import { purgeExpiredRecordings } from "@/server/recordings/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = env.cronSecret();
  if (!secret) return false; // disabled until configured
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const handler = route(async (req) => {
  if (!authorized(req)) throw apiError(401, "unauthorized");
  const now = new Date();
  const reminders = await getNotificationService().runReminderSweep(now, { windowMinutes: 30 });
  const recordingsPurged = await purgeExpiredRecordings(now);
  const prisma = await getPrisma();
  const { count: sessionsPurged } = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return json({ ok: true, at: now.toISOString(), reminders, recordingsPurged, sessionsPurged });
});

export const POST = handler;
export const GET = handler;
