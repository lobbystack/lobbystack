import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { reserveReplacementNumberClaim } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { getNumberClaimTokenSecret } from "@/lib/telephony";

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.claimToken !== "string" || !body.claimToken) return jsonError("claimToken is required.", 400);
  if (body.phoneNumberId !== undefined && (typeof body.phoneNumberId !== "string" || !body.phoneNumberId)) return jsonError("phoneNumberId must be a phone number's id.", 400);
  // The number to replace, which a business holding several names. Without it, the newest.
  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId : undefined;
  const claimId = await reserveReplacementNumberClaim(domain, { userId, businessId, claimToken: body.claimToken, claimTokenSecret: getNumberClaimTokenSecret(), idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : randomUUID(), phoneNumberId });
  return NextResponse.json({ claimId }, { status: 202 });
});
