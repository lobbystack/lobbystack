import { NextResponse } from "next/server";

import { searchBusinessNumberInventory, type NumberSelection } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret, requireNumberSearch } from "@/lib/telephony";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = input as { selection?: Partial<NumberSelection>; limit?: number };
  // Without a carrier for numbers the picker says so, before a search counts against the limit or needs the claim secret.
  const numbers = requireNumberSearch();
  await assertPhoneNumberSearchAllowed({ userId, initial: false });
  return NextResponse.json(await searchBusinessNumberInventory(domain, { userId, businessId, ...(body.selection ? { selection: body.selection } : {}), ...(body.limit !== undefined ? { limit: body.limit } : {}), claimTokenSecret: getNumberClaimTokenSecret() }, numbers));
});
