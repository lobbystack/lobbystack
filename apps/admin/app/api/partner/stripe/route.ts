import { NextResponse } from "next/server";

import { getPartnerStripeConnection } from "@lobbystack/domain";
import { partnerRoute } from "@/lib/partner-request";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The partner console's Stripe page, which only owners open. With
// ?refresh=1, as when the owner comes back from Stripe's onboarding, it asks
// Stripe for the account first instead of waiting for the webhook.

export const GET = partnerRoute(async ({ actor, domain, request }) => {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  return NextResponse.json(await getPartnerStripeConnection(withStripeConnect(domain), actor, { refresh }));
});
