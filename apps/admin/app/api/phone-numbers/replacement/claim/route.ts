import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { reserveReplacementNumberClaim } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret } from "@/lib/twilio-provider";

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.claimToken !== "string" || !body.claimToken) return jsonError("claimToken is required.", 400);
  const claimId = await reserveReplacementNumberClaim(domain, { userId, businessId, claimToken: body.claimToken, claimTokenSecret: getNumberClaimTokenSecret(), idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : randomUUID() });
  return NextResponse.json({ claimId }, { status: 202 });
});
