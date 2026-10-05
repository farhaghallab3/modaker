/**
 * Route-handler plumbing: consistent error JSON, zod body parsing, client IP,
 * rate limiting. Uses only the standard Fetch API so it stays framework-free.
 *
 * Error shape (every non-2xx response): { error: string (Arabic), code: string }
 */
import { ZodError, type ZodType } from "zod";
import {
  ApiError,
  DatabaseNotConfiguredError,
  MESSAGES,
  ProviderError,
  QuranSourceUnavailableError,
  QuranVerificationError,
  apiError,
} from "./errors";
import { LIMITS, rateLimiter } from "./rate-limit";

export function json<T>(data: T, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return Response.json(data, { ...init, headers });
}

export function errorJson(status: number, code: string, error: string, headers?: HeadersInit): Response {
  return json({ error, code }, { status, headers });
}

/** Map any thrown value to the API error shape. Never leaks internals. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    const headers: Record<string, string> = {};
    if (err.status === 429 && (err as ApiError & { retryAfterSec?: number }).retryAfterSec) {
      headers["retry-after"] = String((err as ApiError & { retryAfterSec?: number }).retryAfterSec);
    }
    return errorJson(err.status, err.code, err.userMessage, headers);
  }
  if (err instanceof ZodError) return errorJson(400, "invalid_request", MESSAGES.invalid_request);
  if (err instanceof QuranSourceUnavailableError) return errorJson(503, err.code, MESSAGES.quran_source_unavailable);
  if (err instanceof QuranVerificationError) {
    console.error("[quran] verification failed", err.message, err.problems.slice(0, 5));
    return errorJson(502, err.code, MESSAGES.quran_verification_failed);
  }
  if (err instanceof DatabaseNotConfiguredError) return errorJson(503, err.code, MESSAGES.no_database);
  if (err instanceof ProviderError) {
    console.error(err.message);
    return errorJson(502, "provider_error", MESSAGES.internal);
  }
  console.error("[api] unhandled error", err);
  return errorJson(500, "internal", MESSAGES.internal);
}

/**
 * Wrap a route handler so every thrown error becomes consistent JSON.
 * Generic over the context so Next 15's `{ params: Promise<…> }` type is kept.
 */
export function route<C = unknown>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Parse + validate a JSON body. Throws 400 invalid_request on failure. */
export async function readJson<T>(req: Request, schema: ZodType<T>, maxBytes = 512 * 1024): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw apiError(413, "payload_too_large", MESSAGES.invalid_request);
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > maxBytes) throw apiError(413, "payload_too_large", MESSAGES.invalid_request);
    body = raw ? JSON.parse(raw) : {};
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw apiError(400, "invalid_request");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw apiError(400, "invalid_request");
  return parsed.data;
}

/** Best-effort client IP (behind a trusted proxy such as Vercel/Nginx). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Throws 429 rate_limited when the caller exceeds the named budget. */
export function enforceRateLimit(req: Request, bucket: keyof typeof LIMITS, identity?: string): void {
  const { limit, windowMs } = LIMITS[bucket];
  const key = `${bucket}:${identity ?? clientIp(req)}`;
  const res = rateLimiter.check(key, limit, windowMs);
  if (!res.ok) {
    const err = apiError(429, "rate_limited") as ApiError & { retryAfterSec?: number };
    err.retryAfterSec = res.retryAfterSec;
    throw err;
  }
}

/** Parse a positive integer path segment, or throw 400/404. */
export function parseSurahParam(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) throw apiError(400, "invalid_request");
  if (n < 1 || n > 114) throw apiError(404, "not_found", "رقم السورة غير صحيح (من ١ إلى ١١٤).");
  return n;
}

/**
 * CSRF defence for cookie-authenticated mutations (on top of SameSite=Lax):
 * if the browser sent an Origin header it must match our host.
 * Native/mobile clients send no Origin and are unaffected.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return;
  } catch {
    /* fall through */
  }
  throw apiError(403, "forbidden");
}
