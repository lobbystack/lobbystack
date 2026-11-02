import { NextResponse } from "next/server";

import { searchBusinessNumberInventory, type NumberSelection } from "@lobbystack/domain";
import { guardedNumberSearch } from "@lobbystack/providers/telephony/registry";
import { operatorRoute } from "@/lib/operator-request";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";
import { getNumberClaimTokenSecret, requireNumberSearch } from "@/lib/telephony";

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = input as { selection?: Partial<NumberSelection>; limit?: number };
  // Without a carrier for numbers the picker says so, before a search counts against the limit or needs the claim secret.
  // The limit counts once the country's carrier is known to work.
  const numbers = guardedNumberSearch(requireNumberSearch(), () => assertPhoneNumberSearchAllowed({ userId, initial: false }));
  const result = await searchBusinessNumberInventory(domain, { userId, businessId, purpose: "replacement", ...(body.selection ? { selection: body.selection } : {}), ...(body.limit !== undefined ? { limit: body.limit } : {}), claimTokenSecret: getNumberClaimTokenSecret() }, numbers);
  return NextResponse.json(result);
});
