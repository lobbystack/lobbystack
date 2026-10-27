import { NextResponse } from "next/server";

import { searchBusinessNumberInventory, type NumberSelection } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";
import { getNumberClaimTokenSecret, requireTwilioProvider } from "@/lib/twilio-provider";

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = input as { selection?: Partial<NumberSelection>; limit?: number };
  // Without Twilio the picker says so, before a search counts against the limit or needs the claim secret.
  const twilio = requireTwilioProvider();
  await assertPhoneNumberSearchAllowed({ userId, initial: false });
  const result = await searchBusinessNumberInventory(domain, { userId, businessId, purpose: "replacement", ...(body.selection ? { selection: body.selection } : {}), ...(body.limit !== undefined ? { limit: body.limit } : {}), claimTokenSecret: getNumberClaimTokenSecret() }, twilio);
  return NextResponse.json(result);
});
