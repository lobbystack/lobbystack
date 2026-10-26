import { NextResponse } from "next/server";

import { setPartnerBusinessOverage } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sets the overage of one of the partner's businesses on a package:
 * `{ businessId, enabled, voiceMinuteRateMinor, chatRateMinor, capMinor }`,
 * in the smallest unit of the package's currency, with a null cap for none.
 * The partner operation checks the actor's role and the values.
 */
export const PUT = partnerRoute(async ({ actor, body, domain }) => {
  if (!isUuid(body.businessId)) return jsonError("businessId must be a UUID.", 400, "invalid_request");
  return NextResponse.json({
    billing: await setPartnerBusinessOverage(withStripeConnect(domain), actor, {
      businessId: body.businessId,
      enabled: body.enabled,
      voiceMinuteRateMinor: body.voiceMinuteRateMinor,
      chatRateMinor: body.chatRateMinor,
      capMinor: body.capMinor ?? null,
    }),
  });
});
