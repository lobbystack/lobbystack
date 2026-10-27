import { NextResponse } from "next/server";

import { searchBusinessNumberInventory } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret, requireTwilioProvider } from "@/lib/twilio-provider";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";

export const GET = operatorRoute(async ({ userId, businessId, domain }) => {
  // Without Twilio the picker says so, before a search counts against the limit or needs the claim secret.
  const twilio = requireTwilioProvider();
  await assertPhoneNumberSearchAllowed({ userId, initial: true });
  return NextResponse.json(await searchBusinessNumberInventory(domain, { userId, businessId, limit: 10, claimTokenSecret: getNumberClaimTokenSecret() }, twilio));
});
