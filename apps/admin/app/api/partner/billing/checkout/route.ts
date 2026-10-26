import { NextResponse } from "next/server";

import { createPartnerTierCheckout, getPartnerTierCheckout } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { configuredAppOrigins } from "@/lib/app-origins";
import { partnerRoute } from "@/lib/partner-request";
import { partnerRequestOrigin } from "@/lib/request-brand";

export const dynamic = "force-dynamic";

// A Polar checkout for one of the partner's tiers. The worker makes the
// checkout page, and the Billing page follows the request until it's ready.
// Only owners start or follow one, which the partner operations check.

export const GET = partnerRoute(async ({ actor, request, domain }) => {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!isUuid(requestId)) return jsonError("requestId must be a UUID.", 400, "invalid_request");
  return NextResponse.json(await getPartnerTierCheckout(domain, actor, { requestId }));
});

export const POST = partnerRoute(async ({ actor, request, body, domain }) => {
  if (typeof body.tier !== "string") return jsonError("tier is required.", 400, "invalid_tier");
  if (typeof body.billingInterval !== "string") return jsonError("billingInterval is required.", 400, "invalid_interval");
  // Polar sends the owner back to the console they started from: the partner's host, as the proxy resolved it, or the host's own domain.
  const returnOrigin = partnerRequestOrigin(request.headers) ?? configuredAppOrigins(process.env)[0] ?? new URL(request.url).origin;
  return NextResponse.json(await createPartnerTierCheckout(domain, actor, { tier: body.tier, billingInterval: body.billingInterval, returnOrigin }), { status: 202 });
});
