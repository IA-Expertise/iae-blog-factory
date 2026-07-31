/**
 * Rate limit in-memory por processo (1 réplica Railway).
 * Sem Redis/Upstash — contadores resetam no deploy/restart.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let lastCleanupAt = 0;
const CLEANUP_EVERY_MS = 60_000;
const MAX_KEYS = 20_000;

function cleanupExpired(now: number) {
  if (now - lastCleanupAt < CLEANUP_EVERY_MS && buckets.size < MAX_KEYS) return;
  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
  // Se ainda enorme (ataque de IPs únicos), descarta os mais antigos de forma simples.
  if (buckets.size > MAX_KEYS) {
    const overflow = buckets.size - Math.floor(MAX_KEYS * 0.8);
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;
  const safeWindow = Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : 60_000;
  const now = Date.now();
  cleanupExpired(now);

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + safeWindow };
    buckets.set(key, bucket);
  }

  if (bucket.count >= safeLimit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSec
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, safeLimit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSec: 0
  };
}

export function getRequestClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const WINDOW_MS = 60_000;

export function rateLimitComments(ip: string): RateLimitResult {
  const limit = parsePositiveInt(import.meta.env.RATE_LIMIT_COMMENTS_PER_MIN, 5);
  return checkRateLimit(`comments:${ip}`, limit, WINDOW_MS);
}

export function rateLimitAdClicks(ip: string): RateLimitResult {
  const limit = parsePositiveInt(import.meta.env.RATE_LIMIT_ADS_PER_MIN, 100);
  return checkRateLimit(`ads:${ip}`, limit, WINDOW_MS);
}

export function tooManyRequestsResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: `Too many requests. Try again in ${result.retryAfterSec} seconds.`,
      retryAfter: result.retryAfterSec
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec)
      }
    }
  );
}
