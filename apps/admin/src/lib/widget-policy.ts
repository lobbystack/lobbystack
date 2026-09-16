import { createHash } from "node:crypto";

import Redis from "ioredis";

const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

export type WidgetRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; code: "widget_rate_limited" | "widget_rate_limit_unavailable"; reason: string };

type WidgetLimit = {
  name: string;
  key: string;
  limit: number;
  windowSeconds: number;
  reason: string;
};

let redis: Redis | undefined;

export async function closeWidgetPolicyStore(): Promise<void> {
  const store = redis;
  redis = undefined;
  if (store) await store.quit().catch(() => store.disconnect());
}

function keyDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function limit(name: string, key: string, maximum: number, windowSeconds: number, reason: string): WidgetLimit {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1_000));
  return {
    name,
    key: `${process.env.REDIS_PREFIX ?? "lobbystack"}:widget:${name}:${keyDigest(key)}:${bucket}`,
    limit: maximum,
    windowSeconds,
    reason,
  };
}

export function buildWidgetRateLimits(input: {
  businessId: string;
  widgetKeyId: string;
  ipHash?: string | undefined;
  visitorId?: string | undefined;
  operation: "config" | "chat" | "lead" | "history";
}): WidgetLimit[] {
  const limits: WidgetLimit[] = [];
  if (input.ipHash) {
    limits.push(limit(`${input.operation}-ip-hour`, `${input.businessId}:${input.ipHash}`, input.operation === "chat" ? 60 : 120, hour, "rate_limit_ip_hour"));
    limits.push(limit(`${input.operation}-ip-day`, `${input.businessId}:${input.ipHash}`, input.operation === "chat" ? 300 : 600, day, "rate_limit_ip_day"));
  }
  if (input.visitorId) {
    limits.push(limit(`${input.operation}-visitor-hour`, `${input.businessId}:${input.visitorId}`, input.operation === "chat" ? 60 : 120, hour, "rate_limit_visitor_hour"));
    limits.push(limit(`${input.operation}-visitor-day`, `${input.businessId}:${input.visitorId}`, input.operation === "chat" ? 300 : 600, day, "rate_limit_visitor_day"));
  }
  limits.push(limit("widget-key-minute", `${input.businessId}:${input.widgetKeyId}`, input.operation === "chat" ? 60 : 180, minute, "rate_limit_key_minute"));
  limits.push(limit("widget-key-hour", `${input.businessId}:${input.widgetKeyId}`, input.operation === "chat" ? 600 : 1_000, hour, "rate_limit_key_hour"));
  limits.push(limit("global-minute", "global", 240, minute, "rate_limit_global"));
  return limits;
}

function getRedis(): Redis | undefined {
  const url = process.env.REDIS_URL;
  if (!url) return undefined;
  if (!redis) {
    redis = new Redis(url, {
      connectionName: `${process.env.REDIS_PREFIX ?? "lobbystack"}:widget-policy`,
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

export async function enforceWidgetRateLimits(
  input: Parameters<typeof buildWidgetRateLimits>[0],
  options: { consume: boolean } = { consume: false },
): Promise<WidgetRateLimitResult> {
  const limits = buildWidgetRateLimits(input);
  const store = getRedis();
  if (!store) {
    if (process.env.NODE_ENV !== "production" && !process.env.REDIS_URL) return { allowed: true };
    return { allowed: false, status: 503, code: "widget_rate_limit_unavailable", reason: "rate_limit_unavailable" };
  }
  try {
    await waitForRedis(store);
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
    const args = [options.consume ? "1" : "0", ...limits.flatMap((entry) => [String(entry.limit), String(entry.windowSeconds + 1)])];
    const blockedIndex = Number(await store.eval(script, limits.length, ...limits.map((entry) => entry.key), ...args));
    if (blockedIndex > 0) {
      return { allowed: false, status: 429, code: "widget_rate_limited", reason: limits[blockedIndex - 1]?.reason ?? "rate_limit" };
    }
    return { allowed: true };
  } catch {
    if (process.env.NODE_ENV !== "production" && !process.env.REDIS_URL) return { allowed: true };
    return { allowed: false, status: 503, code: "widget_rate_limit_unavailable", reason: "rate_limit_unavailable" };
  }
}
