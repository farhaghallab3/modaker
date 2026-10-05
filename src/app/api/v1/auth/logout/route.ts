/** POST /api/v1/auth/logout → { ok: true } and clears the cookie (idempotent). */
import { clearSessionCookieHeader, destroySession, optionalSession } from "@/server/auth";
import { json, route } from "@/server/http";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const session = await optionalSession(req);
  if (session) await destroySession(session.sessionId).catch(() => undefined);
  return json({ ok: true as const }, { headers: { "set-cookie": clearSessionCookieHeader() } });
});
