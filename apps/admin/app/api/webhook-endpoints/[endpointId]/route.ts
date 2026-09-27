import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { deleteWebhookEndpoint, updateWebhookEndpoint } from "@lobbystack/domain";
import { asApiResponse, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ endpointId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { endpointId } = await params;
    if (!isUuid(endpointId)) return NextResponse.json({ error: "endpointId must be a UUID.", code: "invalid_request" }, { status: 400 });
    const body = await readJson(request) as { url?: unknown; events?: unknown; description?: unknown; status?: unknown };
    const endpoint = await updateWebhookEndpoint(createDomainContext(), {
      businessId,
      manager: { kind: "operator", userId: session.user.id },
      endpointId,
      url: typeof body.url === "string" ? body.url : undefined,
      events: Array.isArray(body.events) ? body.events.filter((event): event is string => typeof event === "string") : undefined,
      description: typeof body.description === "string" || body.description === null ? body.description : undefined,
      status: body.status === "enabled" || body.status === "disabled" ? body.status : undefined,
    });
    return NextResponse.json({ endpoint });
  } catch (error) { return asApiResponse(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { endpointId } = await params;
    if (!isUuid(endpointId)) return NextResponse.json({ error: "endpointId must be a UUID.", code: "invalid_request" }, { status: 400 });
    await deleteWebhookEndpoint(createDomainContext(), { businessId, manager: { kind: "operator", userId: session.user.id }, endpointId });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
