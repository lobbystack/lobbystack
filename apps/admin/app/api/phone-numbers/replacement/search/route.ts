import { NextResponse } from "next/server";

import { searchBusinessNumberInventory, type NumberSelection } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";
import { getNumberClaimTokenSecret, getTwilioProvider } from "@/lib/twilio-provider";

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = input as { selection?: Partial<NumberSelection>; limit?: number };
  await assertPhoneNumberSearchAllowed({ userId, initial: false });
  const result = await searchBusinessNumberInventory(domain, { userId, businessId, purpose: "replacement", ...(body.selection ? { selection: body.selection } : {}), ...(body.limit !== undefined ? { limit: body.limit } : {}), claimTokenSecret: getNumberClaimTokenSecret() }, getTwilioProvider());
  return NextResponse.json(result);
});
