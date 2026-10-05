/**
 * GET    /api/v1/me/state → UserState (401 if signed out)
 * PUT    /api/v1/me/state  UserState → { ok: true, savedAt }
 * DELETE /api/v1/me/state → { ok: true }  (clears progress, keeps the account)
 * Optional header `x-time-zone: <IANA>` on PUT keeps reminder timing local.
 */
import { requireSession } from "@/server/auth";
import { assertSameOrigin, json, readJson, route } from "@/server/http";
import { timeZoneSchema, userStateSchema } from "@/server/user/schema";
import { clearUserState, loadUserState, saveUserState } from "@/server/user/state-store";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const { userId } = await requireSession(req);
  return json(await loadUserState(userId));
});

export const PUT = route(async (req) => {
  assertSameOrigin(req);
  const { userId } = await requireSession(req);
  const state = await readJson(req, userStateSchema, 4 * 1024 * 1024);
  const tz = timeZoneSchema.safeParse(req.headers.get("x-time-zone") ?? undefined);
  await saveUserState(userId, state, tz.success ? tz.data : undefined);
  return json({ ok: true as const, savedAt: new Date().toISOString() });
});

export const DELETE = route(async (req) => {
  assertSameOrigin(req);
  const { userId } = await requireSession(req);
  await clearUserState(userId);
  return json({ ok: true as const });
});
