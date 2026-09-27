import { NextResponse } from "next/server";

import { resendWebhookDelivery } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { deliveryId } = await params;
    return NextResponse.json(await resendWebhookDelivery(createDomainContext(), { businessId, userId: session.user.id, deliveryId }), { status: 202 });
  } catch (error) { return asApiResponse(error); }
}
