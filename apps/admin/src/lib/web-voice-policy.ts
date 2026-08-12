import { createHash } from "node:crypto";

import Redis from "ioredis";

const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

export type WebVoiceLimit = {
  name: string;
  key: string;
  limit: number;
  windowSeconds: number;
  reason: string;
};

export type WebVoiceLimitStore = {
  evaluate(limits: WebVoiceLimit[], consume: boolean): Promise<number>;
};

export type WebVoiceRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; code: "web_voice_rate_limited" | "web_voice_rate_limit_unavailable"; reason: string };

const dashboardWidgetId = "lobbystack-dashboard-test-call";
let redis: Redis | undefined;

export async function closeWebVoicePolicyStore(): Promise<void> {
  const store = redis;
  redis = undefined;
  if (store) await store.quit().catch(() => store.disconnect());
}

function keyDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function limit(name: string, key: string, maximum: number, windowSeconds: number, reason: string): WebVoiceLimit {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1_000));
  return {
    name,
    key: `${process.env.REDIS_PREFIX ?? "lobbystack"}:web-voice:${name}:${keyDigest(key)}:${bucket}`,
    limit: maximum,
    windowSeconds,
    reason,
  };
}

export function buildWebVoiceRateLimits(input: {
  businessId: string;
  origin: string;
  ipHash?: string | undefined;
  visitorId?: string | undefined;
  widgetId?: string | undefined;
  prospectDemoId?: string | undefined;
  dashboardTestCall?: boolean | undefined;
}): WebVoiceLimit[] {
  const limits: WebVoiceLimit[] = [];
  if (input.prospectDemoId) {
    limits.push(limit("global-minute", "global", 120, minute, "rate_limit_global"));
    if (input.visitorId) limits.push(limit("demo-visitor-30d", `${input.prospectDemoId}:${input.visitorId}`, 5, 30 * day, "prospect_demo_rate_limit_visitor"));
    if (input.ipHash) limits.push(limit("demo-ip-30d", `${input.prospectDemoId}:${input.ipHash}`, 5, 30 * day, "prospect_demo_rate_limit_ip"));
    return limits;
  }

  const dashboard = input.dashboardTestCall === true && input.widgetId === dashboardWidgetId;
  if (input.ipHash) {
    limits.push(limit(dashboard ? "dashboard-ip-hour" : "ip-hour", `${input.businessId}:${input.ipHash}`, dashboard ? 30 : 5, hour, "rate_limit_ip_hour"));
    limits.push(limit(dashboard ? "dashboard-ip-day" : "ip-day", `${input.businessId}:${input.ipHash}`, dashboard ? 100 : 10, day, "rate_limit_ip_day"));
  }
  if (input.visitorId) {
    limits.push(limit(dashboard ? "dashboard-visitor-hour" : "visitor-hour", `${input.businessId}:${input.visitorId}`, dashboard ? 30 : 5, hour, "rate_limit_visitor_hour"));
    limits.push(limit(dashboard ? "dashboard-visitor-day" : "visitor-day", `${input.businessId}:${input.visitorId}`, dashboard ? 100 : 10, day, "rate_limit_visitor_day"));
  }
  limits.push(limit(dashboard ? "dashboard-origin-10m" : "origin-10m", input.origin, 30 * (dashboard ? 4 : 1), 10 * minute, "rate_limit_origin"));
  limits.push(limit(dashboard ? "dashboard-business-hour" : "business-hour", input.businessId, dashboard ? 120 : 60, hour, "rate_limit_business_hour"));
  limits.push(limit(dashboard ? "dashboard-business-day" : "business-day", input.businessId, dashboard ? 600 : 300, day, "rate_limit_business_day"));
  limits.push(limit("global-minute", "global", 120, minute, "rate_limit_global"));
  return limits;
}

function getRedis(): Redis | undefined {
  const url = process.env.REDIS_URL;
  if (!url) return undefined;
  if (!redis) {
    redis = new Redis(url, {
      connectionName: `${process.env.REDIS_PREFIX ?? "lobbystack"}:web-voice-policy`,
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

const redisStore: WebVoiceLimitStore = {
  async evaluate(limits, consume) {
    const store = getRedis();
    if (!store) throw new Error("REDIS_URL is required for web voice rate limiting.");
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
    const args = [consume ? "1" : "0", ...limits.flatMap((entry) => [String(entry.limit), String(entry.windowSeconds + 1)])];
    return Number(await store.eval(script, limits.length, ...limits.map((entry) => entry.key), ...args));
  },
};

export async function enforceWebVoiceRateLimits(
  input: Parameters<typeof buildWebVoiceRateLimits>[0],
  options: { consume: boolean; store?: WebVoiceLimitStore } = { consume: false },
): Promise<WebVoiceRateLimitResult> {
  const limits = buildWebVoiceRateLimits(input);
  if (input.prospectDemoId && !input.visitorId && !input.ipHash) {
    return { allowed: false, status: 429, code: "web_voice_rate_limited", reason: "prospect_demo_rate_limit_missing_identity" };
  }
  try {
    const blockedIndex = await (options.store ?? redisStore).evaluate(limits, options.consume);
    if (blockedIndex > 0) {
      return { allowed: false, status: 429, code: "web_voice_rate_limited", reason: limits[blockedIndex - 1]?.reason ?? "rate_limit" };
    }
    return { allowed: true };
  } catch {
    if (process.env.NODE_ENV !== "production" && !process.env.REDIS_URL) return { allowed: true };
    return { allowed: false, status: 503, code: "web_voice_rate_limit_unavailable", reason: "rate_limit_unavailable" };
  }
}
