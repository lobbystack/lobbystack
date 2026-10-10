import { NextResponse } from "next/server";

import { getOnboardingNumberClaim } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const GET = operatorRoute<{ claimId: string }>(async ({ userId, businessId, domain }, { claimId }) => NextResponse.json({ claim: await getOnboardingNumberClaim(domain, { userId, businessId, claimId }) }));
