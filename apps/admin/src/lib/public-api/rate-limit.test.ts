import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";

import { apiRateLimitPerMinute, checkApiRateLimit, type RateLimitStore } from "./rate-limit";

function memoryStore(): RateLimitStore & { keys: Map<string, number> } {
  const keys = new Map<string, number>();
  return { keys, async increment(key) { const next = (keys.get(key) ?? 0) + 1; keys.set(key, next); return next; } };
}

describe("per-key rate limiting", () => {
  it("allows the limit per minute, then returns Retry-After until the window resets", async () => {
    const store = memoryStore();
    const now = Date.UTC(2026, 8, 27, 12, 0, 45);
    for (let index = 0; index < 3; index += 1) expect(await checkApiRateLimit(store, { apiKeyId: "key-a", limit: 3, now })).toMatchObject({ allowed: true, remaining: 2 - index });
    expect(await checkApiRateLimit(store, { apiKeyId: "key-a", limit: 3, now })).toEqual({ allowed: false, reason: "limited", limit: 3, remaining: 0, resetAt: Date.UTC(2026, 8, 27, 12, 1, 0) / 1000, retryAfterSeconds: 15 });
    expect(await checkApiRateLimit(store, { apiKeyId: "key-a", limit: 3, now: now + 15_000 })).toMatchObject({ allowed: true });
  });

  it("counts each key separately and never puts the key id in Redis in plain text", async () => {
    const store = memoryStore();
    const now = Date.UTC(2026, 8, 27, 12, 0, 0);
    await checkApiRateLimit(store, { apiKeyId: "key-a", limit: 1, now });
    expect(await checkApiRateLimit(store, { apiKeyId: "key-b", limit: 1, now })).toMatchObject({ allowed: true });
    expect([...store.keys.keys()].some((name) => name.includes("key-a"))).toBe(false);
  });

  it("fails closed when the store errors", async () => {
    expect(await checkApiRateLimit({ increment: async () => { throw new Error("down"); } }, { apiKeyId: "k", limit: 1 })).toEqual({ allowed: false, reason: "unavailable" });
  });

  it("reads PUBLIC_API_RATE_LIMIT_PER_MINUTE with a default of 120", () => {
    expect(apiRateLimitPerMinute({})).toBe(120);
    expect(apiRateLimitPerMinute({ PUBLIC_API_RATE_LIMIT_PER_MINUTE: "30" })).toBe(30);
    expect(apiRateLimitPerMinute({ PUBLIC_API_RATE_LIMIT_PER_MINUTE: "nope" })).toBe(120);
  });

  // Opt-in: runs against a real Redis when LOBBYSTACK_TEST_REDIS_URL is set.
  const redisUrl = process.env.LOBBYSTACK_TEST_REDIS_URL;
  const redis = redisUrl ? new Redis(redisUrl, { lazyConnect: true }) : undefined;
  afterAll(async () => { await redis?.quit(); });
  it.skipIf(!redis)("enforces the limit with Redis", async () => {
    const store: RateLimitStore = { async increment(key, ttl) { const [[, count]] = (await redis!.multi().incr(key).expire(key, ttl).exec()) as [[null, number]]; return count; } };
    const apiKeyId = `test-${Date.now()}`;
    const results = [];
    for (let index = 0; index < 4; index += 1) results.push(await checkApiRateLimit(store, { apiKeyId, limit: 3, prefix: "lobbystack-test" }));
    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false]);
  });
});
