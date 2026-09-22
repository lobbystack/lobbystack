import { createHash } from "node:crypto";

import Redis from "ioredis";

const minute = 60;
const hour = 60 * minute;

export type CalendarOAuthOperation = "start" | "callback";

export type CalendarOAuthLimit = {
  name: string;
  key: string;
  limit: number;
  windowSeconds: number;
  reason: string;
};

export type CalendarOAuthLimitStore = {
  evaluate(limits: CalendarOAuthLimit[], consume: boolean): Promise<number>;
};

export type CalendarOAuthRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; code: "calendar_oauth_rate_limited" | "calendar_oauth_rate_limit_unavailable"; reason: string };

let redis: Redis | undefined;

export async function closeCalendarOAuthLimitStore(): Promise<void> {
  const store = redis;
  redis = undefined;
  if (store) await store.quit().catch(() => store.disconnect());
}

function keyDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function limit(name: string, key: string, maximum: number, windowSeconds: number, reason: string): CalendarOAuthLimit {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1_000));
  return {
    name,
    key: `${process.env.REDIS_PREFIX ?? "lobbystack"}:calendar-oauth:${name}:${keyDigest(key)}:${bucket}`,
    limit: maximum,
    windowSeconds,
    reason,
  };
}

/**
 * Bounded, hashed dimensions for the Google Calendar authorization flow:
 * the authenticated operator, the target business, and the trusted client IP.
 * `start` is only ever called after authentication and membership, so the IP
 * dimension is skipped when no trusted header is configured and the identity
 * limits still apply. `callback` is unauthenticated at entry, so it always
 * carries an IP dimension, falling back to one coarse shared bucket when the
 * deployment has not configured a trusted header.
 *
 * Calls happen at distinct points: the callback entry check carries only the
 * IP (or shared bucket), and the post-verification check carries only the user
 * and business. That keeps each dimension counted once per request.
 */
export function buildCalendarOAuthRateLimits(input: {
  operation: CalendarOAuthOperation;
  userId?: string | undefined;
  businessId?: string | undefined;
  ip?: string | undefined;
}): CalendarOAuthLimit[] {
  const limits: CalendarOAuthLimit[] = [];
  const unauthenticated = input.operation === "callback" && !input.userId && !input.businessId;
  if (input.ip) {
    limits.push(limit("ip-hour", `${input.operation}:${input.ip}`, unauthenticated ? 120 : 30, hour, "rate_limit_ip_hour"));
  } else if (unauthenticated) {
    limits.push(limit("ip-unattributed-hour", "unattributed", 600, hour, "rate_limit_ip_unattributed"));
  }
  if (input.userId) {
    limits.push(limit("user-hour", `${input.operation}:${input.userId}`, input.operation === "start" ? 20 : 60, hour, "rate_limit_user_hour"));
  }
  if (input.businessId) {
    limits.push(limit("business-hour", `${input.operation}:${input.businessId}`, input.operation === "start" ? 60 : 120, hour, "rate_limit_business_hour"));
  }
  return limits;
}

function getRedis(): Redis | undefined {
  const url = process.env.REDIS_URL;
  if (!url) return undefined;
  if (!redis) {
    redis = new Redis(url, {
      connectionName: `${process.env.REDIS_PREFIX ?? "lobbystack"}:calendar-oauth-policy`,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    redis.on("error", () => undefined);
  }
  return redis;
}

async function waitForRedis(store: Redis): Promise<void> {
  if (store.status === "ready") return;
  if (store.status === "end") throw new Error("Redis is unavailable.");
  if (store.status === "wait") {
    await store.connect();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      store.off("ready", onReady);
      store.off("error", onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Redis readiness timed out.")); }, 2_500);
    timeout.unref?.();
    store.once("ready", onReady);
    store.once("error", onError);
  });
}

const redisStore: CalendarOAuthLimitStore = {
  async evaluate(limits, consume) {
    const store = getRedis();
    if (!store) throw new Error("REDIS_URL is required for calendar OAuth rate limiting.");
    await waitForRedis(store);
    if (limits.length === 0) return 0;
    const script = `
      for index, key in ipairs(KEYS) do
        local count = tonumber(redis.call('GET', key) or '0')
        local maximum = tonumber(ARGV[index * 2])
        if count >= maximum then return index end
      end
      if ARGV[1] == '1' then
        for index, key in ipairs(KEYS) do
          local count = redis.call('INCR', key)
          if count == 1 then redis.call('EXPIRE', key, tonumber(ARGV[index * 2 + 1])) end
        end
      end
      return 0
    `;
    const args = [consume ? "1" : "0", ...limits.flatMap((entry) => [String(entry.limit), String(entry.windowSeconds + 1)])];
    return Number(await store.eval(script, limits.length, ...limits.map((entry) => entry.key), ...args));
  },
};

export async function enforceCalendarOAuthRateLimits(
  input: Parameters<typeof buildCalendarOAuthRateLimits>[0],
  options: { consume: boolean; store?: CalendarOAuthLimitStore } = { consume: false },
): Promise<CalendarOAuthRateLimitResult> {
  const limits = buildCalendarOAuthRateLimits(input);
  try {
    const blockedIndex = await (options.store ?? redisStore).evaluate(limits, options.consume);
    if (blockedIndex > 0) {
      return { allowed: false, status: 429, code: "calendar_oauth_rate_limited", reason: limits[blockedIndex - 1]?.reason ?? "rate_limit" };
    }
    return { allowed: true };
  } catch {
    if (process.env.NODE_ENV !== "production" && !process.env.REDIS_URL) return { allowed: true };
    return { allowed: false, status: 503, code: "calendar_oauth_rate_limit_unavailable", reason: "rate_limit_unavailable" };
  }
}
