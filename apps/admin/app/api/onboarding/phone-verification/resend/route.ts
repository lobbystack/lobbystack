import { NextResponse } from "next/server";

import { getLatestPhoneVerificationAttempt, requestPhoneVerification } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { getTwilioProvider } from "@/lib/twilio-provider";

export async function POST(request: Request) {
  try { const session = await requireApiSession(request); const businessId = businessIdFromRequest(request); if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 }); const attempt = await getLatestPhoneVerificationAttempt(createDomainContext(), { userId: session.user.id, businessId }); if (!attempt) return NextResponse.json({ error: "No verification attempt exists." }, { status: 404 }); return NextResponse.json({ attemptId: await requestPhoneVerification(createDomainContext(), { userId: session.user.id, businessId, phoneNumber: attempt.phoneE164 }, getTwilioProvider()) }, { status: 202 }); } catch (error) { return asApiResponse(error); }
}
