import { NextResponse } from "next/server";

import { getOnboardingNumberClaim } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const GET = operatorRoute<{ claimId: string }>(async ({ userId, businessId, domain }, { claimId }) => {
  const claim = await getOnboardingNumberClaim(domain, { userId, businessId, claimId });
  if (claim && claim.purpose !== "replacement") return jsonError("Replacement claim not found.", 404);
  return NextResponse.json({ claim });
});
