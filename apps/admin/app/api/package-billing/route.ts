import { NextResponse } from "next/server";

import { getPackageBilling } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A partner's business's billing page: the package its partner sells it, and
// whether it pays, for its owners and admins. A direct business pays the host
// on its plan page instead.

export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json(await getPackageBilling(withStripeConnect(domain), { userId, businessId })));
