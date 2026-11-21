import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { orderOnboardingNumberClaim, type AssignedNumberProvider, type NumberSelection } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret, getTelephony, requestIpHash, requireNumberSearch } from "@/lib/telephony";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";
import { trustedClientCountry } from "@/lib/trusted-client-ip";

// Orders a number in a city, for a country whose carrier names the number when it takes the order, and reserves the
// claim for it. The order is charged at once, so the plan, the onboarding step and any claim in flight are checked first.
export const POST = operatorRoute(async ({ request, userId, businessId, body: input, domain }) => {
  const body = input as { selection?: Partial<NumberSelection>; idempotencyKey?: unknown };
  requireNumberSearch();
  await assertPhoneNumberSearchAllowed({ userId, initial: false });
  const telephony = getTelephony();
  const provider: AssignedNumberProvider = {
    assignsOnOrder: (countryCode) => telephony.assignedNumbers.assignsOnOrder(countryCode),
    listReusable: (search) => telephony.assignedNumbers.listReusable(search),
    take: (number) => telephony.assignedNumbers.takeReusable(number),
    order: (order) => telephony.assignedNumbers.order(order),
    release: async ({ carrier, providerPhoneId }) => { await telephony.forNumber(carrier)?.inventory?.releasePhoneNumber({ providerPhoneId }); },
  };
  const claimId = await orderOnboardingNumberClaim(domain, { userId, businessId, selection: body.selection ?? {}, claimTokenSecret: getNumberClaimTokenSecret(), idempotencyKey: typeof body.idempotencyKey === "string" && body.idempotencyKey ? body.idempotencyKey : randomUUID(), ipHash: requestIpHash(request), ipCountry: trustedClientCountry(request) }, provider);
  return NextResponse.json({ claimId }, { status: 202 });
});
