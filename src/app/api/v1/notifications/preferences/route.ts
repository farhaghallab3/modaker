/**
 * GET /api/v1/notifications/preferences → NotificationPreferences & { timeZone }
 * PUT /api/v1/notifications/preferences  NotificationPreferences & { timeZone? } → same
 * `timeZone` is an IANA zone (e.g. "Asia/Riyadh") used to send reminders at the
 * user's local preferredTime. Also accepted via the `x-time-zone` header.
 */
import { requireSession } from "@/server/auth";
import { assertSameOrigin, json, readJson, route } from "@/server/http";
import { loadPreferences, savePreferences } from "@/server/user/state-store";
import { notificationPrefsSchema, timeZoneSchema } from "@/server/user/schema";

export const runtime = "nodejs";

const bodySchema = notificationPrefsSchema.extend({ timeZone: timeZoneSchema.optional() });

export const GET = route(async (req) => {
  const { userId } = await requireSession(req);
  return json(await loadPreferences(userId));
});

export const PUT = route(async (req) => {
  assertSameOrigin(req);
  const { userId } = await requireSession(req);
  const { timeZone, ...prefs } = await readJson(req, bodySchema, 8 * 1024);
  const headerTz = timeZoneSchema.safeParse(req.headers.get("x-time-zone") ?? undefined);
  return json(await savePreferences(userId, prefs, timeZone ?? (headerTz.success ? headerTz.data : undefined)));
});
