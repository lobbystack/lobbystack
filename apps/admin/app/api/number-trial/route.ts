import { NextResponse } from "next/server";

import { getNumberTrialState } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { trustedClientCountry } from "@/lib/trusted-client-ip";

export const dynamic = "force-dynamic";

// The trial number's state, for the dashboard banner, Home and the setup
// guide. The request's country decides whether a trial is on offer.
export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => NextResponse.json({ trial: await getNumberTrialState(domain, { userId, businessId, ipCountry: trustedClientCountry(request) }) }));
