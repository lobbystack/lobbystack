import { NextResponse } from "next/server";

import { getNumberTrialState } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// The trial number's state, for the dashboard banner.
export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json({ trial: await getNumberTrialState(domain, { userId, businessId }) }));
