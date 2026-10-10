import { NextResponse } from "next/server";

import { createWebhookEndpoint, listWebhookEndpoints } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json({ endpoints: await listWebhookEndpoints(domain, { businessId, manager: { kind: "operator", userId } }) }));

/** The response carries the signing secret once. */
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const created = await createWebhookEndpoint(domain, {
    businessId,
    manager: { kind: "operator", userId },
    url: typeof body.url === "string" ? body.url : "",
    events: Array.isArray(body.events) ? body.events.filter((event): event is string => typeof event === "string") : [],
    description: typeof body.description === "string" ? body.description : undefined,
  });
  return NextResponse.json(created, { status: 201 });
});
