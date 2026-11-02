import { PublicApiError, type NumberInventoryProvider } from "@lobbystack/domain";
import { guardedNumberSearch } from "@lobbystack/providers/telephony/registry";

import { enforceFixedWindow, fixedWindowLimit } from "./fixed-window-limit";
import { getNumberClaimTokenSecret, getTelephony, numbersConfigured } from "./telephony";

/**
 * A partner's key has no account to count against, so its searches count
 * against the partner, at the same 20 in 10 minutes, shared by all its keys.
 */
async function requirePartnerNumberSearchAllowed(partnerId: string): Promise<void> {
  const result = await enforceFixedWindow([fixedWindowLimit("phone-number-search", "partner-10m", partnerId, 20, 600, "rate_limit_partner")]);
  if (result.allowed) return;
  if (result.status === 503) throw new PublicApiError(503, "rate_limit_unavailable", "Number search is unavailable for a moment. Retry shortly.", undefined, { "Retry-After": "5" });
  // The limit counts in fixed 10-minute windows.
  const retryAfter = 600 - (Math.floor(Date.now() / 1_000) % 600);
  throw new PublicApiError(429, "rate_limited", `Too many number searches. A partner's platform keys can search 20 times in 10 minutes between them. Retry in ${retryAfter} seconds.`, undefined, { "Retry-After": String(retryAfter) });
}

/** What a partner's key searches for numbers with, on REST and MCP: the carriers behind the partner's search limit. */
export function partnerNumberSearch(partnerId: string): { provider: NumberInventoryProvider; claimTokenSecret: string } {
  if (!numbersConfigured()) throw new PublicApiError(503, "phone_numbers_unavailable", "Phone numbers aren't set up on this deployment.");
  return { provider: guardedNumberSearch(getTelephony().numbers, () => requirePartnerNumberSearchAllowed(partnerId)), claimTokenSecret: getNumberClaimTokenSecret() };
}
