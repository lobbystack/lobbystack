import { enforceFixedWindow, fixedWindowLimit, type FixedWindowLimit } from "./fixed-window-limit";
import { closeRedis } from "./redis";

const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

export type WebVoiceRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; code: "web_voice_rate_limited" | "web_voice_rate_limit_unavailable"; reason: string };

/** Closes the Redis connection the limiter uses, for scripts that exit afterwards. */
export const closeWebVoicePolicyStore = closeRedis;

function limit(name: string, key: string, maximum: number, windowSeconds: number, reason: string): FixedWindowLimit {
  return fixedWindowLimit("web-voice", name, key, maximum, windowSeconds, reason);
}

export function buildWebVoiceRateLimits(input: {
  businessId: string;
  origin: string;
  ipHash?: string | undefined;
  visitorId?: string | undefined;
  prospectDemoId?: string | undefined;
  dashboardTestCall?: boolean | undefined;
}): FixedWindowLimit[] {
  const limits: FixedWindowLimit[] = [];
  if (input.prospectDemoId) {
    limits.push(limit("global-minute", "global", 120, minute, "rate_limit_global"));
    limits.push(limit("demo-business-hour", input.businessId, 60, hour, "rate_limit_business_hour"));
    if (input.visitorId) limits.push(limit("demo-visitor-30d", `${input.prospectDemoId}:${input.visitorId}`, 5, 30 * day, "prospect_demo_rate_limit_visitor"));
    if (input.ipHash) limits.push(limit("demo-ip-30d", `${input.prospectDemoId}:${input.ipHash}`, 5, 30 * day, "prospect_demo_rate_limit_ip"));
    return limits;
  }

  const dashboard = input.dashboardTestCall === true;
  if (input.ipHash) {
    limits.push(limit(dashboard ? "dashboard-ip-hour" : "ip-hour", `${input.businessId}:${input.ipHash}`, dashboard ? 30 : 5, hour, "rate_limit_ip_hour"));
    limits.push(limit(dashboard ? "dashboard-ip-day" : "ip-day", `${input.businessId}:${input.ipHash}`, dashboard ? 100 : 10, day, "rate_limit_ip_day"));
  }
  if (input.visitorId) {
    limits.push(limit(dashboard ? "dashboard-visitor-hour" : "visitor-hour", `${input.businessId}:${input.visitorId}`, dashboard ? 30 : 5, hour, "rate_limit_visitor_hour"));
    limits.push(limit(dashboard ? "dashboard-visitor-day" : "visitor-day", `${input.businessId}:${input.visitorId}`, dashboard ? 100 : 10, day, "rate_limit_visitor_day"));
  }
  limits.push(limit(dashboard ? "dashboard-origin-10m" : "origin-10m", `${input.businessId}:${input.origin}`, 30 * (dashboard ? 4 : 1), 10 * minute, "rate_limit_origin"));
  limits.push(limit(dashboard ? "dashboard-business-hour" : "business-hour", input.businessId, dashboard ? 120 : 60, hour, "rate_limit_business_hour"));
  limits.push(limit(dashboard ? "dashboard-business-day" : "business-day", input.businessId, dashboard ? 600 : 300, day, "rate_limit_business_day"));
  limits.push(limit("global-minute", "global", 120, minute, "rate_limit_global"));
  return limits;
}

export async function enforceWebVoiceRateLimits(
  input: Parameters<typeof buildWebVoiceRateLimits>[0],
  // ponytail: ignored; scripts/replacement-web-voice-policy-check.ts still passes { consume: true }. Drop with that call.
  _legacyOptions?: { consume: true },
): Promise<WebVoiceRateLimitResult> {
  if (input.prospectDemoId && !input.visitorId && !input.ipHash) {
    return { allowed: false, status: 429, code: "web_voice_rate_limited", reason: "prospect_demo_rate_limit_missing_identity" };
  }
  const result = await enforceFixedWindow(buildWebVoiceRateLimits(input));
  if (result.allowed) return result;
  return { ...result, code: result.status === 429 ? "web_voice_rate_limited" : "web_voice_rate_limit_unavailable" };
}
