import { NextResponse } from "next/server";

import { releaseBusiness } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Releases one of the partner's businesses to its owner, who keeps it on the
// host's Free plan. The partner operation checks the actor's role, that the
// owner accepted their invitation, and that the business no longer pays for
// one of the partner's packages through Stripe.
export const POST = partnerRoute(async ({ actor, businessId, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400, "business_required");
  await releaseBusiness(withStripeConnect(domain), actor, { businessId });
  return NextResponse.json({ ok: true });
});
