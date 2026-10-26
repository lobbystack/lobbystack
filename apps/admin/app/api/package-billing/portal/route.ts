import { NextResponse } from "next/server";

import { openPackagePortal } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { partnerRequestOrigin } from "@/lib/request-brand";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A link to the partner's Stripe customer portal for the business, answered as `{ url }`. */
export const POST = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const origin = partnerRequestOrigin(request.headers);
  if (!origin) return jsonError("Business not found.", 404, "business_not_found");
  return NextResponse.json(await openPackagePortal(withStripeConnect(domain), { userId, businessId, returnUrl: `${origin}/settings/subscription` }));
});
