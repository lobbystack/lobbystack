import { normalizeIP } from "@better-auth/core/utils/ip";

import { enforceFixedWindow, fixedWindowLimit, type FixedWindowLimit } from "./fixed-window-limit";

const hour = 60 * 60;

export type CalendarOAuthOperation = "start" | "callback";

export type CalendarOAuthRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; code: "calendar_oauth_rate_limited" | "calendar_oauth_rate_limit_unavailable"; reason: string };

function limit(name: string, key: string, maximum: number, windowSeconds: number, reason: string): FixedWindowLimit {
  return fixedWindowLimit("calendar-oauth", name, key, maximum, windowSeconds, reason);
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
}): FixedWindowLimit[] {
  const limits: FixedWindowLimit[] = [];
  const unauthenticated = input.operation === "callback" && !input.userId && !input.businessId;
  if (input.ip) {
    // One host usually owns a whole IPv6 /64, so count the subnet as one client.
    limits.push(limit("ip-hour", `${input.operation}:${normalizeIP(input.ip, { ipv6Subnet: 64 })}`, unauthenticated ? 120 : 30, hour, "rate_limit_ip_hour"));
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

export async function enforceCalendarOAuthRateLimits(input: Parameters<typeof buildCalendarOAuthRateLimits>[0]): Promise<CalendarOAuthRateLimitResult> {
  const result = await enforceFixedWindow(buildCalendarOAuthRateLimits(input));
  if (result.allowed) return result;
  return { ...result, code: result.status === 429 ? "calendar_oauth_rate_limited" : "calendar_oauth_rate_limit_unavailable" };
}
