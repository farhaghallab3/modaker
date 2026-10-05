/**
 * GET    /api/v1/me → { user: { id, email, createdAt }, profile }   (401 if signed out)
 * DELETE /api/v1/me → { ok: true }  Permanently deletes the account and ALL data:
 *        progress, recitations + stored audio, conversations + citations,
 *        notifications, push subscriptions, sessions. Clears the cookie.
 */
import { clearSessionCookieHeader, requireSession } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { assertSameOrigin, json, route } from "@/server/http";
import { deleteAccount } from "@/server/user/account";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const { userId } = await requireSession(req);
  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true, profile: true },
  });
  const { profile, ...rest } = user!;
  return json({ user: rest, profile });
});

export const DELETE = route(async (req) => {
  assertSameOrigin(req);
  const { userId } = await requireSession(req);
  await deleteAccount(userId);
  return json({ ok: true as const }, { headers: { "set-cookie": clearSessionCookieHeader() } });
});
