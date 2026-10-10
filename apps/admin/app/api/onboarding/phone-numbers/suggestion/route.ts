import { NextResponse } from "next/server";

import { searchBusinessNumberInventory } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret, getTwilioProvider } from "@/lib/twilio-provider";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";

export const GET = operatorRoute(async ({ userId, businessId, domain }) => {
  await assertPhoneNumberSearchAllowed({ userId, initial: true });
  return NextResponse.json(await searchBusinessNumberInventory(domain, { userId, businessId, limit: 10, claimTokenSecret: getNumberClaimTokenSecret() }, getTwilioProvider()));
});
