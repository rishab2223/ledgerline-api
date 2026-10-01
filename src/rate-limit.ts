import type { NextFunction, Request, Response } from "express";
import type { ApiKey } from "./auth.js";

/** Token-bucket parameters per key tier (ADR-007): capacity and refill per 60 s. */
const TIERS: Record<ApiKey["tier"], { capacity: number; refillPerMinute: number }> = {
  free: { capacity: 20, refillPerMinute: 20 },
  pro: { capacity: 200, refillPerMinute: 200 },
};

type Bucket = { tokens: number; updatedAt: number };

export type RateLimitOptions = { now?: () => number };

/**
 * Per-API-key token bucket. Must run after `apiKeyAuth` (it reads `req.apiKey`).
 * Refill is continuous: fractional tokens accrue with elapsed time. The clock is
 * injectable so tests never sleep.
 */
export function rateLimit(opts: RateLimitOptions = {}) {
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const { capacity, refillPerMinute } = TIERS[req.apiKey.tier];
    const ratePerMs = refillPerMinute / 60_000;
    const t = now();

    let bucket = buckets.get(req.apiKey.key);
    if (!bucket) {
      bucket = { tokens: capacity, updatedAt: t };
      buckets.set(req.apiKey.key, bucket);
    }
    bucket.tokens = Math.min(capacity, bucket.tokens + (t - bucket.updatedAt) * ratePerMs);
    bucket.updatedAt = t;

    const allowed = bucket.tokens >= 1;
    if (allowed) {
      bucket.tokens -= 1;
    }

    const remaining = Math.max(0, Math.floor(bucket.tokens));
    const secondsUntilFull = Math.ceil((capacity - bucket.tokens) / ratePerMs / 1000) || 0;
    res.setHeader("X-RateLimit-Limit", String(capacity));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(secondsUntilFull));

    if (!allowed) {
      const secondsUntilToken = Math.max(1, Math.ceil((1 - bucket.tokens) / ratePerMs / 1000)) || 1;
      res.setHeader("Retry-After", String(secondsUntilToken));
      res.status(429).json({ error: "RATE_LIMITED", message: `rate limit exceeded for this API key; retry in ${secondsUntilToken}s` });
      return;
    }
    next();
  };
}
