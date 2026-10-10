import { NextResponse } from "next/server";

import { getOperatorPhoneVerification, startOperatorPhoneVerification } from "@lobbystack/domain";
import { normalizeInterfaceLocale } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { inferPhoneCountry, normalizePhoneNumber } from "@/lib/phone";

export const dynamic = "force-dynamic";

// Sends a code to verify the signed-in operator's phone for SMS alerts. Call
// again with the same number to resend, or with another number to change it.
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const phoneE164 = typeof body.phoneNumber === "string" ? normalizePhoneNumber(body.phoneNumber) : undefined;
  const countryCode = phoneE164 ? inferPhoneCountry(phoneE164) : undefined;
  if (!phoneE164 || !countryCode) return jsonError("Enter a valid mobile number.", 422, "phone_number_invalid");
  const { attemptId } = await startOperatorPhoneVerification(domain, { userId, businessId, phoneE164, countryCode, locale: normalizeInterfaceLocale(typeof body.locale === "string" ? body.locale : null) ?? "en" });
  return NextResponse.json({ attemptId, phoneE164 }, { status: 202 });
});

// Whether the code for one of the operator's attempts has been sent yet.
export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const attemptId = new URL(request.url).searchParams.get("attemptId");
  if (!attemptId) return jsonError("An attemptId is required.", 400, "attempt_required");
  const attempt = await getOperatorPhoneVerification(domain, { userId, businessId, attemptId });
  if (!attempt) return jsonError("Verification not found.", 404, "verification_not_found");
  return NextResponse.json({ attempt: { id: attempt.id, status: attempt.status, expiresAt: attempt.expiresAt.toISOString() } });
});
