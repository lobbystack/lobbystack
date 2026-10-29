import { NextResponse } from "next/server";

import { searchBusinessNumberInventory } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret, requireNumberSearch } from "@/lib/telephony";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";

export const GET = operatorRoute(async ({ userId, businessId, domain }) => {
  // Without a carrier for numbers the picker says so, before a search counts against the limit or needs the claim secret.
  const numbers = requireNumberSearch();
  await assertPhoneNumberSearchAllowed({ userId, initial: true });
  return NextResponse.json(await searchBusinessNumberInventory(domain, { userId, businessId, limit: 10, claimTokenSecret: getNumberClaimTokenSecret() }, numbers));
});
