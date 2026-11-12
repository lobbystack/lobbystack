import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { reserveExtraNumberClaim } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret } from "@/lib/telephony";

/** Buys the offered number for one of the business's agents. */
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.claimToken !== "string" || !body.claimToken) return jsonError("claimToken is required.", 400);
  if (typeof body.agentId !== "string" || !body.agentId) return jsonError("agentId is required.", 400);
  const claimId = await reserveExtraNumberClaim(domain, { userId, businessId, agentId: body.agentId, claimToken: body.claimToken, claimTokenSecret: getNumberClaimTokenSecret(), idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : randomUUID() });
  return NextResponse.json({ claimId }, { status: 202 });
});
