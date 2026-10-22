import { enforceFixedWindow, fixedWindowLimit, type FixedWindowLimit } from "./fixed-window-limit";

const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

export type WidgetRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; code: "widget_rate_limited" | "widget_rate_limit_unavailable"; reason: string };

// Each open chat reopens its live update stream every 10 minutes and when its
// tab comes back into view, and a Redis drop reopens every stream at once. These
// leave room for about 500 chats open at once on one key.
const STREAM_KEY_LIMITS = { minute: 600, hour: 12_000 };

function limit(name: string, key: string, maximum: number, windowSeconds: number, reason: string): FixedWindowLimit {
  return fixedWindowLimit("widget", name, key, maximum, windowSeconds, reason);
}

export function buildWidgetRateLimits(input: {
  businessId: string;
  widgetKeyId: string;
  ipHash?: string | undefined;
  visitorId?: string | undefined;
  operation: "config" | "chat" | "lead" | "history" | "session" | "stream";
}): FixedWindowLimit[] {
  const limits: FixedWindowLimit[] = [];
  if (input.ipHash) {
    limits.push(limit(`${input.operation}-ip-hour`, `${input.businessId}:${input.ipHash}`, input.operation === "chat" ? 60 : 120, hour, "rate_limit_ip_hour"));
    limits.push(limit(`${input.operation}-ip-day`, `${input.businessId}:${input.ipHash}`, input.operation === "chat" ? 300 : 600, day, "rate_limit_ip_day"));
  }
  if (input.visitorId) {
    limits.push(limit(`${input.operation}-visitor-hour`, `${input.businessId}:${input.visitorId}`, input.operation === "chat" ? 60 : 120, hour, "rate_limit_visitor_hour"));
    limits.push(limit(`${input.operation}-visitor-day`, `${input.businessId}:${input.visitorId}`, input.operation === "chat" ? 300 : 600, day, "rate_limit_visitor_day"));
  }
  limits.push(limit(`${input.operation}-key-minute`, `${input.businessId}:${input.widgetKeyId}`, input.operation === "chat" ? 60 : input.operation === "stream" ? STREAM_KEY_LIMITS.minute : 180, minute, "rate_limit_key_minute"));
  limits.push(limit(`${input.operation}-key-hour`, `${input.businessId}:${input.widgetKeyId}`, input.operation === "chat" ? 600 : input.operation === "stream" ? STREAM_KEY_LIMITS.hour : 1_000, hour, "rate_limit_key_hour"));
  if (input.operation === "session") limits.push(limit("session-business-minute", input.businessId, 60, minute, "rate_limit_business"));
  return limits;
}

export async function enforceWidgetRateLimits(input: Parameters<typeof buildWidgetRateLimits>[0]): Promise<WidgetRateLimitResult> {
  const result = await enforceFixedWindow(buildWidgetRateLimits(input));
  if (result.allowed) return result;
  return { ...result, code: result.status === 429 ? "widget_rate_limited" : "widget_rate_limit_unavailable" };
}

/**
 * The keyed loader (/embed.js?key=...) looks its key up in the database before
 * any session exists, and every distinct key misses the CDN's cache. A visitor's
 * browser asks again at most once a minute per key, so these leave room for a
 * crowd behind one network address. Without a trusted client address, every
 * request counts against one shared bucket. Past a limit the loader skips the
 * lookup and serves the plain script.
 */
export function buildWidgetLoaderRateLimits(input: { ipHash?: string | undefined }): FixedWindowLimit[] {
  if (!input.ipHash) return [limit("loader-shared-minute", "shared", 3_000, minute, "rate_limit_shared_minute")];
  return [
    limit("loader-ip-minute", input.ipHash, 120, minute, "rate_limit_ip_minute"),
    limit("loader-ip-hour", input.ipHash, 1_200, hour, "rate_limit_ip_hour"),
  ];
}

export async function enforceWidgetLoaderRateLimits(input: { ipHash?: string | undefined }): Promise<WidgetRateLimitResult> {
  const result = await enforceFixedWindow(buildWidgetLoaderRateLimits(input));
  if (result.allowed) return result;
  return { ...result, code: result.status === 429 ? "widget_rate_limited" : "widget_rate_limit_unavailable" };
}
