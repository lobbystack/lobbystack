import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { listWebhookDeliveries } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute<{ endpointId: string }>(async ({ userId, businessId, domain }, { endpointId }) => {
  if (!isUuid(endpointId)) return NextResponse.json({ error: "endpointId must be a UUID.", code: "invalid_request" }, { status: 400 });
  return NextResponse.json({ deliveries: await listWebhookDeliveries(domain, { businessId, userId, endpointId }) });
});
