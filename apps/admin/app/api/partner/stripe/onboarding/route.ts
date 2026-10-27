import { NextResponse } from "next/server";

import { startPartnerStripeOnboarding } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";
import { consoleOrigin, withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts or resumes Stripe's onboarding for the partner's account and answers
 * `{ url }` to send the owner to. `{ country }` is the country a new account
 * opens in. Stripe sends the owner back to the Stripe page on the domain the
 * console was opened on.
 */
export const POST = partnerRoute(async ({ actor, body, domain, partnerId, request }) => {
  if (body.country !== undefined && body.country !== null && typeof body.country !== "string") return jsonError("country must be a string.", 400, "invalid_country");
  const page = `${consoleOrigin(request.headers)}/partner/${partnerId.toLowerCase()}/payments`;
  const { url } = await startPartnerStripeOnboarding(withStripeConnect(domain), actor, {
    country: typeof body.country === "string" ? body.country : null,
    returnUrl: `${page}?onboarding=return`,
    // Stripe opens this when the link expired or was used; the page asks for a new one.
    refreshUrl: `${page}?onboarding=refresh`,
  });
  return NextResponse.json({ url });
});
