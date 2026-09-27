import { NextResponse } from "next/server";

import { listWebhookDeliveries } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { endpointId } = await params;
    return NextResponse.json({ deliveries: await listWebhookDeliveries(createDomainContext(), { businessId, userId: session.user.id, endpointId }) });
  } catch (error) { return asApiResponse(error); }
}
