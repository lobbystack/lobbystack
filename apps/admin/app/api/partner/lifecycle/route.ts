import { NextResponse } from "next/server";

import { getPartnerLifecycle } from "@lobbystack/domain";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// Where the partner stands since its paid tier ended, and when its businesses
// pause and are deleted, for the console's Businesses page. Only owners and
// admins read it, which the partner operation checks.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json(await getPartnerLifecycle(domain, actor)));
