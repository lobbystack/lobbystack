import { NextResponse } from "next/server";

import { setPartnerPoolOverage } from "@lobbystack/domain";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// The pool's overage on the console's Billing page: on or off, and its
// monthly cap in US cents, or null for none. Only owners change it, which the
// partner operation checks, along with the values.

export const POST = partnerRoute(async ({ actor, body, domain }) => NextResponse.json(await setPartnerPoolOverage(domain, actor, { enabled: body.enabled, capCents: body.capCents ?? null })));
