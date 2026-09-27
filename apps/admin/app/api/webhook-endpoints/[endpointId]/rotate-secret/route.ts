import { NextResponse } from "next/server";

import { isUuid } from "@lobbystack/shared";

import { rotateWebhookSecret } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

/** The response carries the new signing secret once. */
export async function POST(request: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { endpointId } = await params;
    if (!isUuid(endpointId)) return NextResponse.json({ error: "endpointId must be a UUID.", code: "invalid_request" }, { status: 400 });
    return NextResponse.json(await rotateWebhookSecret(createDomainContext(), { businessId, manager: { kind: "operator", userId: session.user.id }, endpointId }));
  } catch (error) { return asApiResponse(error); }
}
