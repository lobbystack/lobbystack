import { NextResponse } from "next/server";

import { skipOnboardingNumber } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export async function POST(request: Request) {
  try { const { session, businessId } = await requireOperatorBusiness(request); await skipOnboardingNumber(createDomainContext(), { userId: session.user.id, businessId }); return NextResponse.json({ ok: true }); } catch (error) { return asApiResponse(error); }
}
