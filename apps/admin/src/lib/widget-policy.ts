import { enforceFixedWindow, fixedWindowLimit, type FixedWindowLimit } from "./fixed-window-limit";

const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

export type WidgetRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; code: "widget_rate_limited" | "widget_rate_limit_unavailable"; reason: string };

function limit(name: string, key: string, maximum: number, windowSeconds: number, reason: string): FixedWindowLimit {
  return fixedWindowLimit("widget", name, key, maximum, windowSeconds, reason);
}

export function buildWidgetRateLimits(input: {
  businessId: string;
  widgetKeyId: string;
  ipHash?: string | undefined;
  visitorId?: string | undefined;
  operation: "config" | "chat" | "lead" | "history" | "session";
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
  limits.push(limit(`${input.operation}-key-minute`, `${input.businessId}:${input.widgetKeyId}`, input.operation === "chat" ? 60 : 180, minute, "rate_limit_key_minute"));
  limits.push(limit(`${input.operation}-key-hour`, `${input.businessId}:${input.widgetKeyId}`, input.operation === "chat" ? 600 : 1_000, hour, "rate_limit_key_hour"));
  if (input.operation === "session") limits.push(limit("session-business-minute", input.businessId, 60, minute, "rate_limit_business"));
  return limits;
}

export async function enforceWidgetRateLimits(input: Parameters<typeof buildWidgetRateLimits>[0]): Promise<WidgetRateLimitResult> {
  const result = await enforceFixedWindow(buildWidgetRateLimits(input));
  if (result.allowed) return result;
  return { ...result, code: result.status === 429 ? "widget_rate_limited" : "widget_rate_limit_unavailable" };
}
