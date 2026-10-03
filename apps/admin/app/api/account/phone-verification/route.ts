import { NextResponse } from "next/server";

import { getOperatorPhoneVerification, startOperatorPhoneVerification } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { inferPhoneCountry, normalizePhoneNumber } from "@/lib/phone";

export const dynamic = "force-dynamic";

// Sends a code to verify the signed-in operator's phone for SMS alerts. Call
// again with the same number to resend, or with another number to change it.
export async function POST(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request) as { phoneNumber?: unknown; locale?: unknown };
    const phoneE164 = typeof body.phoneNumber === "string" ? normalizePhoneNumber(body.phoneNumber) : undefined;
    const countryCode = phoneE164 ? inferPhoneCountry(phoneE164) : undefined;
    if (!phoneE164 || !countryCode) return jsonError("Enter a valid mobile number.", 422, "phone_number_invalid");
    const { attemptId } = await startOperatorPhoneVerification(createDomainContext(), { userId: session.user.id, businessId, phoneE164, countryCode, ...(typeof body.locale === "string" ? { locale: body.locale } : {}) });
    return NextResponse.json({ attemptId, phoneE164 }, { status: 202 });
  } catch (error) {
    return asApiResponse(error);
  }
}

// Whether the code for one of the operator's attempts has been sent yet.
export async function GET(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const attemptId = new URL(request.url).searchParams.get("attemptId");
    if (!attemptId) return jsonError("An attemptId is required.", 400, "attempt_required");
    const attempt = await getOperatorPhoneVerification(createDomainContext(), { userId: session.user.id, businessId, attemptId });
    if (!attempt) return jsonError("Verification not found.", 404, "verification_not_found");
    return NextResponse.json({ attempt: { id: attempt.id, status: attempt.status, expiresAt: attempt.expiresAt.toISOString() } });
  } catch (error) {
    return asApiResponse(error);
  }
}
