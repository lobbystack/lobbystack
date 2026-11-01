import { normalizeIP } from "@better-auth/core/utils/ip";

import { enforceFixedWindow, fixedWindowLimit, type FixedWindowResult } from "./fixed-window-limit";

const minute = 60;

/**
 * Bounds calendar webhook deliveries per sending client, before the body is
 * read or the database is asked. Cal.com and Calendly send every account's
 * deliveries from their own servers, so the limit is generous.
 */
export async function enforceCalendarWebhookClientLimit(input: { ip?: string | undefined }): Promise<FixedWindowResult> {
  return await enforceFixedWindow([
    input.ip
      ? fixedWindowLimit("calendar-webhook", "ip-minute", normalizeIP(input.ip, { ipv6Subnet: 64 }), 600, minute, "rate_limit_ip_minute")
      : fixedWindowLimit("calendar-webhook", "ip-unattributed-minute", "unattributed", 1_200, minute, "rate_limit_ip_unattributed"),
  ]);
}

/**
 * Bounds verified deliveries for one connection. It runs only after the
 * signature checks out, so forged posts can't spend a real connection's budget.
 */
export async function enforceCalendarWebhookConnectionLimit(input: { connectionId: string }): Promise<FixedWindowResult> {
  return await enforceFixedWindow([fixedWindowLimit("calendar-webhook", "connection-minute", input.connectionId, 120, minute, "rate_limit_connection_minute")]);
}
