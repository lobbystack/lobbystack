import { NextResponse } from "next/server";

import { searchExtraNumbers, type NumberSelection } from "@lobbystack/domain";
import { guardedNumberSearch } from "@lobbystack/providers/telephony/registry";
import { operatorRoute } from "@/lib/operator-request";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";
import { getNumberClaimTokenSecret, requireNumberSearch } from "@/lib/telephony";
import { trustedClientCountry } from "@/lib/trusted-client-ip";

/** Numbers the business can buy as extra ones, with the monthly price for the country, or null when they're free. */
export const POST = operatorRoute(async ({ request, userId, businessId, body: input, domain }) => {
  const body = input as { selection?: Partial<NumberSelection>; limit?: number };
  const numbers = guardedNumberSearch(requireNumberSearch(), () => assertPhoneNumberSearchAllowed({ userId, initial: false }));
  const result = await searchExtraNumbers(domain, { userId, businessId, ...(body.selection ? { selection: body.selection } : {}), ...(body.limit !== undefined ? { limit: body.limit } : {}), claimTokenSecret: getNumberClaimTokenSecret(), ipCountry: trustedClientCountry(request) }, numbers);
  return NextResponse.json(result);
});
