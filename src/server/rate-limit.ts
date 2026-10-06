/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Per-process only: good enough for a single Node instance and as a first
 * line of defence. For multi-instance deployments swap `MemoryRateLimiter`
 * for a Redis/Upstash implementation behind the same `RateLimiter` interface.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** seconds until a slot frees up (0 when ok) */
  retryAfterSec: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number, now?: number): RateLimitResult;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;

  check(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    this.sweep(now, windowMs);
    const since = now - windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= limit) {
      this.hits.set(key, list);
      return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000)) };
    }
    list.push(now);
    this.hits.set(key, list);
    return { ok: true, remaining: limit - list.length, retryAfterSec: 0 };
  }

  /** Drop idle keys occasionally so the map cannot grow without bound. */
  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, list] of this.hits) {
      if (!list.length || list[list.length - 1] <= now - Math.max(windowMs, 3_600_000)) this.hits.delete(k);
    }
  }

  reset() {
    this.hits.clear();
  }
}

const g = globalThis as unknown as { __muzakkirLimiter?: MemoryRateLimiter };
export const rateLimiter: MemoryRateLimiter = (g.__muzakkirLimiter ??= new MemoryRateLimiter());

/** Named budgets used by the route handlers. */
export const LIMITS = {
  transcribe: { limit: 20, windowMs: 10 * 60_000 },
  analyze: { limit: 60, windowMs: 10 * 60_000 },
  assistant: { limit: 20, windowMs: 5 * 60_000 },
  coach: { limit: 30, windowMs: 10 * 60_000 },
  auth: { limit: 10, windowMs: 15 * 60_000 },
  default: { limit: 120, windowMs: 60_000 },
} as const;
