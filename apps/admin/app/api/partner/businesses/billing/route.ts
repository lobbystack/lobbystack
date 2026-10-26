import { NextResponse } from "next/server";

import { setPartnerBusinessBilling } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sells one of the partner's businesses `{ businessId, packageId }`, or bills
 * it outside LobbyStack when packageId is null. The partner operation checks
 * the actor's role, and refuses while the business's subscription is live.
 */
export const PUT = partnerRoute(async ({ actor, body, domain }) => {
  if (!isUuid(body.businessId)) return jsonError("businessId must be a UUID.", 400, "invalid_request");
  if (body.packageId !== null && !isUuid(body.packageId)) return jsonError("packageId must be a UUID, or null to bill the business outside LobbyStack.", 400, "invalid_package");
  return NextResponse.json({ billing: await setPartnerBusinessBilling(withStripeConnect(domain), actor, { businessId: body.businessId, packageId: body.packageId }) });
});
