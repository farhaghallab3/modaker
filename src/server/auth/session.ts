/**
 * Signed session cookie.
 *
 * Cookie value: `<sessionId>.<expiresUnix>.<hmac>` where
 *   hmac = base64url(HMAC-SHA256(SESSION_SECRET, "<sessionId>.<expiresUnix>"))
 * The session id refers to a `Session` row, so logout / account deletion
 * revoke immediately. The pure sign/verify helpers have no DB dependency.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { apiError } from "../errors";

export const SESSION_COOKIE = "mz_session";
export const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 86_400_000;

export interface Session {
  userId: string;
  sessionId: string;
  expiresAt: Date;
}

function secret(): string {
  const s = env.sessionSecret();
  if (!s || (env.isProd() && (s.length < 32 || s.startsWith("change-me")))) {
    throw new Error("SESSION_SECRET must be set to a random string of 32+ characters.");
  }
  return s;
}

function mac(payload: string, key = secret()): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function signSessionToken(sessionId: string, expiresAt: Date, key?: string): string {
  const payload = `${sessionId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return `${payload}.${mac(payload, key)}`;
}

/** Returns the session id if the signature is valid and not expired. */
export function verifySessionToken(token: string, now = Date.now(), key?: string): { sessionId: string; expiresAt: Date } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [sessionId, exp, sig] = parts;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId) || !/^\d{9,11}$/.test(exp)) return null;
  const expected = Buffer.from(mac(`${sessionId}.${exp}`, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const expiresAt = new Date(Number(exp) * 1000);
  if (expiresAt.getTime() <= now) return null;
  return { sessionId, expiresAt };
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookieHeader(token: string, expiresAt: Date): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}`,
  ];
  if (env.isProd()) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookieHeader(): string {
  const attrs = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT"];
  if (env.isProd()) attrs.push("Secure");
  return attrs.join("; ");
}

// ── DB-backed helpers ────────────────────────────────────────────────────

export async function createSession(userId: string, userAgent?: string | null): Promise<{ token: string; expiresAt: Date }> {
  const { getPrisma } = await import("../db");
  const prisma = await getPrisma();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const row = await prisma.session.create({
    data: { userId, expiresAt, userAgent: userAgent?.slice(0, 255) ?? null },
  });
  return { token: signSessionToken(row.id, expiresAt), expiresAt };
}

/** Resolve the request's session, or null. Never throws for bad cookies. */
export async function getSession(req: Request): Promise<Session | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const parsed = verifySessionToken(token);
  if (!parsed) return null;
  const { hasDatabase, getPrisma } = await import("../db");
  if (!hasDatabase()) return null;
  const prisma = await getPrisma();
  const row = await prisma.session.findUnique({ where: { id: parsed.sessionId } });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return { userId: row.userId, sessionId: row.id, expiresAt: row.expiresAt };
}

/** Like getSession but throws 401 (or 503 when there is no database). */
export async function requireSession(req: Request): Promise<Session> {
  const { hasDatabase } = await import("../db");
  if (!hasDatabase()) throw apiError(503, "no_database");
  const s = await getSession(req);
  if (!s) throw apiError(401, "unauthorized");
  return s;
}

export async function destroySession(sessionId: string): Promise<void> {
  const { getPrisma } = await import("../db");
  const prisma = await getPrisma();
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Session if signed in and the DB is reachable; never throws (for optional-auth routes). */
export async function optionalSession(req: Request): Promise<Session | null> {
  try {
    return await getSession(req);
  } catch {
    return null;
  }
}
