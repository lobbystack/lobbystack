import { NextResponse } from "next/server";

import { getOnboardingNumberClaim } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export async function GET(request: Request, context: { params: Promise<{ claimId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    const { claimId } = await context.params;
    if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });
    const claim = await getOnboardingNumberClaim(createDomainContext(), { userId: session.user.id, businessId, claimId });
    if (claim && claim.purpose !== "replacement") return NextResponse.json({ error: "Replacement claim not found." }, { status: 404 });
    return NextResponse.json({ claim });
  } catch (error) { return asApiResponse(error); }
}
