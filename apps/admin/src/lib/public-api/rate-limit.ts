import { PUBLIC_API_DEFAULT_RATE_LIMIT_PER_MINUTE } from "@lobbystack/shared";

import { getRedis, waitForRedis } from "../redis";

// Fixed one-minute windows per API key in Redis. The window resets on the
// minute, which is what X-RateLimit-Reset and Retry-After report.

export type RateLimitDecision =
  | { allowed: true; limit: number; remaining: number; resetAt: number }
  | { allowed: false; reason: "limited"; limit: number; remaining: 0; resetAt: number; retryAfterSeconds: number }
  | { allowed: false; reason: "unavailable" };

/** The one Redis command the limiter needs, so tests can supply an in-memory store. */
export type RateLimitStore = { increment(key: string, ttlSeconds: number): Promise<number> };

const WINDOW_SECONDS = 60;

export function apiRateLimitPerMinute(environment: Readonly<Record<string, string | undefined>> = process.env): number {
  const configured = Number(environment.PUBLIC_API_RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(configured) && configured > 0 ? configured : PUBLIC_API_DEFAULT_RATE_LIMIT_PER_MINUTE;
}

export async function checkApiRateLimit(store: RateLimitStore, input: { apiKeyId: string; limit: number; now?: number; prefix?: string }): Promise<RateLimitDecision> {
  const now = input.now ?? Date.now();
  const window = Math.floor(now / (WINDOW_SECONDS * 1000));
  const resetAt = (window + 1) * WINDOW_SECONDS;
  // apiKeyId is the key's database id (a UUID), never the secret, so it names the counter directly.
  const key = `${input.prefix ?? process.env.REDIS_PREFIX ?? "lobbystack"}:public-api:rate:${input.apiKeyId}:${window}`;
  try {
    const count = await store.increment(key, WINDOW_SECONDS + 1);
    if (count > input.limit) return { allowed: false, reason: "limited", limit: input.limit, remaining: 0, resetAt, retryAfterSeconds: Math.max(1, resetAt - Math.floor(now / 1000)) };
    return { allowed: true, limit: input.limit, remaining: Math.max(0, input.limit - count), resetAt };
  } catch {
    return { allowed: false, reason: "unavailable" };
  }
}

function redisStore(): RateLimitStore | undefined {
  const client = getRedis();
  if (!client) return undefined;
  return {
    async increment(key, ttlSeconds) {
      await waitForRedis(client);
      const [[incrementError, count] = [null, 0], [expireError] = [null]] = (await client.multi().incr(key).expire(key, ttlSeconds).exec()) ?? [];
      if (incrementError || expireError) throw incrementError ?? expireError;
      return Number(count);
    },
  };
}

/**
 * Enforces the per-key limit. Without REDIS_URL outside production the
 * limiter lets requests through, matching the widget limiter; in production a
 * missing or failing Redis rejects requests instead of running unmetered.
 */
export async function enforceApiRateLimit(apiKeyId: string, store: RateLimitStore | undefined = redisStore()): Promise<RateLimitDecision> {
  const limit = apiRateLimitPerMinute();
  if (!store) {
    if (process.env.NODE_ENV !== "production") return { allowed: true, limit, remaining: limit, resetAt: Math.ceil(Date.now() / 60_000) * 60 };
    return { allowed: false, reason: "unavailable" };
  }
  return await checkApiRateLimit(store, { apiKeyId, limit });
}
