import type { CountryCode } from "libphonenumber-js";
import { NextResponse } from "next/server";

import { startOnboardingPhoneVerification } from "@lobbystack/domain";
import { normalizeInterfaceLocale } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { inferPhoneCountry, normalizePhoneNumber } from "@/lib/phone";
import { getOnboardingPhoneVerifyProvider } from "@/lib/twilio-provider";

export const dynamic = "force-dynamic";

// The onboarding "verify you're real" step. The country the owner picks for
// their phone is the country their number comes from.
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const countryCode = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : "";
  const phoneE164 = typeof body.phoneNumber === "string" && /^[A-Z]{2}$/.test(countryCode) ? normalizePhoneNumber(body.phoneNumber, { defaultCountry: countryCode as CountryCode }) : undefined;
  if (!phoneE164) return jsonError("Enter a valid mobile number.", 422, "phone_number_invalid");
  // The trial number comes from the phone's country, so the phone has to be from the country picked.
  if (inferPhoneCountry(phoneE164) !== countryCode) return jsonError("This number isn't from the country you picked.", 422, "phone_country_mismatch");
  const locale = normalizeInterfaceLocale(typeof body.locale === "string" ? body.locale : null) ?? "en";
  const { attemptId } = await startOnboardingPhoneVerification(domain, { userId, businessId, phoneE164, countryCode, locale }, getOnboardingPhoneVerifyProvider());
  return NextResponse.json({ attemptId, phoneE164 }, { status: 202 });
});
