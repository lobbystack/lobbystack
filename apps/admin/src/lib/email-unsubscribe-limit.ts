import "server-only";

import { enforceFixedWindow, fixedWindowLimit, type FixedWindowLimit, type FixedWindowResult } from "./fixed-window-limit";
import { requestIpHash } from "./widget-keys";

const minute = 60;
const hour = 60 * minute;

function limit(name: string, key: string, maximum: number, windowSeconds: number, reason: string): FixedWindowLimit {
  return fixedWindowLimit("email-unsubscribe", name, key, maximum, windowSeconds, reason);
}

/**
 * The limits on the signed-out unsubscribe and resubscribe links. Mail
 * providers POST one-click unsubscribes from shared servers, so the address
 * limits leave room for many people behind one. Without a trusted client
 * address, every request counts against one shared bucket. Each token gets
 * its own small allowance, since one person has no reason to flip it often.
 */
export function buildEmailUnsubscribeRateLimits(input: { ipHash?: string | undefined; token: string }): FixedWindowLimit[] {
  const limits = input.ipHash
    ? [limit("ip-minute", input.ipHash, 60, minute, "rate_limit_ip_minute"), limit("ip-hour", input.ipHash, 600, hour, "rate_limit_ip_hour")]
    : [limit("shared-minute", "shared", 3_000, minute, "rate_limit_shared_minute")];
  limits.push(limit("token-hour", input.token, 20, hour, "rate_limit_token_hour"));
  return limits;
}

export async function enforceEmailUnsubscribeRateLimits(request: Request, token: string): Promise<FixedWindowResult> {
  return await enforceFixedWindow(buildEmailUnsubscribeRateLimits({ ipHash: requestIpHash(request), token }));
}
