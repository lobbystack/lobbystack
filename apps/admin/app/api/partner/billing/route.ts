import { NextResponse } from "next/server";

import { getPartnerBilling } from "@lobbystack/domain";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// The partner console's Billing page: the tier the partner pays the host for.
// Only owners read it, which the partner operation checks.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json(await getPartnerBilling(domain, actor)));
