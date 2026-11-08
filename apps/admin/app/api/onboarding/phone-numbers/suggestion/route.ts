import { NextResponse } from "next/server";

import { searchBusinessNumberInventory } from "@lobbystack/domain";
import { guardedNumberSearch } from "@lobbystack/providers/telephony/registry";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret, requestIpHash, requireNumberSearch } from "@/lib/telephony";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";
import { trustedClientCountry } from "@/lib/trusted-client-ip";

export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  // Without a carrier for numbers the picker says so, before a search counts against the limit or needs the claim secret.
  // The limit counts once the country's carrier is known to work.
  const numbers = guardedNumberSearch(requireNumberSearch(), () => assertPhoneNumberSearchAllowed({ userId, initial: true }));
  return NextResponse.json(await searchBusinessNumberInventory(domain, { userId, businessId, limit: 10, claimTokenSecret: getNumberClaimTokenSecret(), ipHash: requestIpHash(request), ipCountry: trustedClientCountry(request) }, numbers));
});
