import { NextResponse } from "next/server";

import { createWebhookEndpoint, listWebhookEndpoints } from "@lobbystack/domain";
import { asApiResponse, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    return NextResponse.json({ endpoints: await listWebhookEndpoints(createDomainContext(), { businessId, manager: { kind: "operator", userId: session.user.id } }) });
  } catch (error) { return asApiResponse(error); }
}

/** The response carries the signing secret once. */
export async function POST(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request) as { url?: unknown; events?: unknown; description?: unknown };
    const created = await createWebhookEndpoint(createDomainContext(), {
      businessId,
      manager: { kind: "operator", userId: session.user.id },
      url: typeof body.url === "string" ? body.url : "",
      events: Array.isArray(body.events) ? body.events.filter((event): event is string => typeof event === "string") : [],
      description: typeof body.description === "string" ? body.description : undefined,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}
