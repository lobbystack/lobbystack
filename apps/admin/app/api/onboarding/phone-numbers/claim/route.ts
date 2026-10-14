import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { reserveOnboardingNumberClaim } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret, requestIpHash } from "@/lib/twilio-provider";

export const POST = operatorRoute(async ({ request, userId, businessId, body, domain }) => {
  if (typeof body.claimToken !== "string" || !body.claimToken) return jsonError("claimToken is required.", 400);
  return NextResponse.json({ claimId: await reserveOnboardingNumberClaim(domain, { userId, businessId, claimToken: body.claimToken, claimTokenSecret: getNumberClaimTokenSecret(), idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : randomUUID(), ipHash: requestIpHash(request) }) }, { status: 202 });
});
