import { NextResponse } from "next/server";

import { getCallDetail } from "@lobbystack/domain";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await params;
    const detail = await withOperatorTransaction(request, async ({ session, businessId }) => await getCallDetail(createDomainContext(), { userId: session.user.id, businessId, callId }));
    if (!detail) return NextResponse.json({ error: "Call not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    return asApiResponse(error);
  }
}
