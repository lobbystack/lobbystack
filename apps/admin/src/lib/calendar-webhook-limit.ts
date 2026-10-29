import { normalizeIP } from "@better-auth/core/utils/ip";

import { enforceFixedWindow, fixedWindowLimit, type FixedWindowResult } from "./fixed-window-limit";

const minute = 60;

/**
 * Bounds Cal.com webhook deliveries before any database work: per sending
 * client and per connection. Cal.com sends every account's deliveries from
 * its own servers, so the client limit is generous; a forged flood against
 * one connection hits the connection limit first.
 */
export async function enforceCalendarWebhookRateLimits(input: { connectionId: string; ip?: string | undefined }): Promise<FixedWindowResult> {
  return await enforceFixedWindow([
    input.ip
      ? fixedWindowLimit("calendar-webhook", "ip-minute", normalizeIP(input.ip, { ipv6Subnet: 64 }), 600, minute, "rate_limit_ip_minute")
      : fixedWindowLimit("calendar-webhook", "ip-unattributed-minute", "unattributed", 1_200, minute, "rate_limit_ip_unattributed"),
    fixedWindowLimit("calendar-webhook", "connection-minute", input.connectionId, 120, minute, "rate_limit_connection_minute"),
  ]);
}
