import { NextResponse } from "next/server";

import { getOnboardingNumberClaim } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export async function GET(request: Request, context: { params: Promise<{ claimId: string }> }) {
  try { const { session, businessId } = await requireOperatorBusiness(request); const { claimId } = await context.params; return NextResponse.json({ claim: await getOnboardingNumberClaim(createDomainContext(), { userId: session.user.id, businessId, claimId }) }); } catch (error) { return asApiResponse(error); }
}
