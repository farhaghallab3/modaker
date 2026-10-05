/**
 * POST /api/v1/auth/register { email, password, name? } → { user: { id, email } } + session cookie
 * 503 { code: "no_database" } when DATABASE_URL is not set (client keeps a device-only account).
 */
import { z } from "zod";
import { createSession, hashPassword, sessionCookieHeader } from "@/server/auth";
import { normalizeEmail, requireDatabase } from "@/server/auth/guards";
import { getPrisma } from "@/server/db";
import { apiError } from "@/server/errors";
import { assertSameOrigin, enforceRateLimit, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(80).optional(),
});

export const POST = route(async (req) => {
  requireDatabase();
  assertSameOrigin(req);
  enforceRateLimit(req, "auth");
  const body = await readJson(req, bodySchema, 8 * 1024);
  const email = normalizeEmail(body.email);
  const prisma = await getPrisma();

  const passwordHash = await hashPassword(body.password);
  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: { create: { name: body.name ?? email.split("@")[0] } },
        notificationPreference: { create: {} },
      },
      select: { id: true, email: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw apiError(409, "email_taken");
    throw e;
  }

  const { token, expiresAt } = await createSession(user.id, req.headers.get("user-agent"));
  return json({ user }, { status: 201, headers: { "set-cookie": sessionCookieHeader(token, expiresAt) } });
});
