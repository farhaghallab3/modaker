/** POST /api/v1/auth/login { email, password } → { user: { id, email } } + session cookie */
import { z } from "zod";
import { createSession, dummyVerify, hashPassword, needsRehash, sessionCookieHeader, verifyPassword } from "@/server/auth";
import { normalizeEmail, requireDatabase } from "@/server/auth/guards";
import { getPrisma } from "@/server/db";
import { apiError } from "@/server/errors";
import { assertSameOrigin, enforceRateLimit, json, readJson, route } from "@/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({ email: z.string().trim().max(254), password: z.string().min(1).max(200) });

export const POST = route(async (req) => {
  requireDatabase();
  assertSameOrigin(req);
  const body = await readJson(req, bodySchema, 8 * 1024);
  const email = normalizeEmail(body.email);
  // Limit per IP and per account to slow down credential stuffing.
  enforceRateLimit(req, "auth");
  enforceRateLimit(req, "auth", `email:${email}`);

  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await dummyVerify(body.password); // equalise timing
    throw apiError(401, "invalid_credentials");
  }
  if (!(await verifyPassword(body.password, user.passwordHash))) throw apiError(401, "invalid_credentials");
  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password) } });
  }

  const { token, expiresAt } = await createSession(user.id, req.headers.get("user-agent"));
  return json({ user: { id: user.id, email: user.email } }, { headers: { "set-cookie": sessionCookieHeader(token, expiresAt) } });
});
