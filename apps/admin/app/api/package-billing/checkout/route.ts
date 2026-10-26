import { NextResponse } from "next/server";

import { startPackageCheckout } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { partnerRequestOrigin } from "@/lib/request-brand";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A Stripe Checkout on the partner's account for the business's package, answered as `{ url }`, when its subscription isn't live. */
export const POST = operatorRoute(async ({ request, session, userId, businessId, domain }) => {
  // A partner's business opens only on its partner's domain, so Stripe sends the owner back there.
  const origin = partnerRequestOrigin(request.headers);
  if (!origin) return jsonError("Business not found.", 404, "business_not_found");
  const page = `${origin}/settings/subscription`;
  return NextResponse.json(await startPackageCheckout(withStripeConnect(domain), { userId, businessId, email: session.user.email ?? null, successUrl: `${page}?checkout=complete`, cancelUrl: page }));
});
