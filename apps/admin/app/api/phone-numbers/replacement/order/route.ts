import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { orderReplacementNumberClaim, type NumberSelection } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { assignedNumberProvider } from "@/lib/assigned-number-provider";
import { getNumberClaimTokenSecret, requestIpHash, requireNumberSearch } from "@/lib/telephony";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";
import { trustedClientCountry } from "@/lib/trusted-client-ip";

// Gives a replacement number in a city, for a country whose carrier names the number when it takes the order. The
// order is charged at once, so the replacement's own checks run first. Without phoneNumberId, the newest number is replaced.
export const POST = operatorRoute(async ({ request, userId, businessId, body: input, domain }) => {
  const body = input as { selection?: Partial<NumberSelection>; idempotencyKey?: unknown; phoneNumberId?: unknown };
  if (body.phoneNumberId !== undefined && (typeof body.phoneNumberId !== "string" || !body.phoneNumberId)) return jsonError("phoneNumberId must be a phone number's id.", 400);
  requireNumberSearch();
  await assertPhoneNumberSearchAllowed({ userId, initial: false });
  const claimId = await orderReplacementNumberClaim(domain, { userId, businessId, selection: body.selection ?? {}, claimTokenSecret: getNumberClaimTokenSecret(), idempotencyKey: typeof body.idempotencyKey === "string" && body.idempotencyKey ? body.idempotencyKey : randomUUID(), ...(typeof body.phoneNumberId === "string" ? { phoneNumberId: body.phoneNumberId } : {}), ipHash: requestIpHash(request), ipCountry: trustedClientCountry(request) }, assignedNumberProvider());
  return NextResponse.json({ claimId }, { status: 202 });
});
