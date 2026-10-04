import { NextResponse } from "next/server";

import { getOnboardingNumberClaim } from "@lobbystack/domain";
import { asApiResponse, jsonError, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export async function GET(request: Request, context: { params: Promise<{ claimId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { claimId } = await context.params;
    const claim = await getOnboardingNumberClaim(createDomainContext(), { userId: session.user.id, businessId, claimId });
    if (claim && claim.purpose !== "replacement") return jsonError("Replacement claim not found.", 404);
    return NextResponse.json({ claim });
  } catch (error) { return asApiResponse(error); }
}
