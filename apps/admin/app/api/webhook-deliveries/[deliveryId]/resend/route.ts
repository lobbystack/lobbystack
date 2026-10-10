import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { resendWebhookDelivery } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const POST = operatorRoute<{ deliveryId: string }>(async ({ userId, businessId, domain }, { deliveryId }) => {
  if (!isUuid(deliveryId)) return NextResponse.json({ error: "deliveryId must be a UUID.", code: "invalid_request" }, { status: 400 });
  return NextResponse.json(await resendWebhookDelivery(domain, { businessId, userId, deliveryId }), { status: 202 });
});
