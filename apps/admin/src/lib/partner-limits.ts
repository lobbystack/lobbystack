import { PublicApiError } from "@lobbystack/domain";

import { enforceFixedWindow, fixedWindowLimit } from "./fixed-window-limit";

// The hourly limits on partner work that costs the host, such as an email or
// a website read. A partner's platform keys share one allowance per kind,
// since a partner can make as many keys as it likes. A person shares theirs
// with their own console requests, under the console's names.

export type PartnerLimit = { name: string; limit: number; what: string };

/** Who the limit counts against: the partner for its keys, the person otherwise. */
export type PartnerLimitSubject = { partnerId: string; userId?: string | undefined };

export async function requirePartnerActionAllowed(subject: PartnerLimitSubject, input: PartnerLimit): Promise<void> {
  const window = subject.userId
    ? fixedWindowLimit(input.name, "user-hour", subject.userId, input.limit, 60 * 60, "rate_limit_user_hour")
    : fixedWindowLimit(input.name, "partner-hour", subject.partnerId, input.limit, 60 * 60, "rate_limit_partner_hour");
  const result = await enforceFixedWindow([window]);
  if (result.allowed) return;
  if (result.status === 503) throw new PublicApiError(503, "rate_limit_unavailable", "This is unavailable for a moment. Retry shortly.", undefined, { "Retry-After": "5" });
  // The limit counts in fixed one-hour windows.
  const retryAfter = 3_600 - (Math.floor(Date.now() / 1_000) % 3_600);
  const who = subject.userId ? "One person can make" : "A partner's platform keys can make";
  throw new PublicApiError(429, "rate_limited", `Too many ${input.what}. ${who} ${input.limit} an hour${subject.userId ? "" : " between them"}. Retry in ${retryAfter} seconds.`, undefined, { "Retry-After": String(retryAfter) });
}
