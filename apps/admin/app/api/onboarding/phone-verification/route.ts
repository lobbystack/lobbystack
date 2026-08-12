import { NextResponse } from "next/server";

import { getLatestPhoneVerificationAttempt } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export async function GET(request: Request) {
  try { const session = await requireApiSession(request); const businessId = businessIdFromRequest(request); if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 }); return NextResponse.json({ attempt: await getLatestPhoneVerificationAttempt(createDomainContext(), { userId: session.user.id, businessId }) }); } catch (error) { return asApiResponse(error); }
}
