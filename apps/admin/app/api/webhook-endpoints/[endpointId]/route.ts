import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { deleteWebhookEndpoint, updateWebhookEndpoint } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const PATCH = operatorRoute<{ endpointId: string }>(async ({ userId, businessId, body, domain }, { endpointId }) => {
  if (!isUuid(endpointId)) return NextResponse.json({ error: "endpointId must be a UUID.", code: "invalid_request" }, { status: 400 });
  const endpoint = await updateWebhookEndpoint(domain, {
    businessId,
    manager: { kind: "operator", userId },
    endpointId,
    url: typeof body.url === "string" ? body.url : undefined,
    events: Array.isArray(body.events) ? body.events.filter((event): event is string => typeof event === "string") : undefined,
    description: typeof body.description === "string" || body.description === null ? body.description : undefined,
    status: body.status === "enabled" || body.status === "disabled" ? body.status : undefined,
  });
  return NextResponse.json({ endpoint });
});

export const DELETE = operatorRoute<{ endpointId: string }>(async ({ userId, businessId, domain }, { endpointId }) => {
  if (!isUuid(endpointId)) return NextResponse.json({ error: "endpointId must be a UUID.", code: "invalid_request" }, { status: 400 });
  await deleteWebhookEndpoint(domain, { businessId, manager: { kind: "operator", userId }, endpointId });
  return NextResponse.json({ ok: true });
});
