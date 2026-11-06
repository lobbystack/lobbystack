import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses } from "@lobbystack/db";
import { countryCodeForBusinessTimezone, joinNumberWaitlist, numberCountries, onboardingNumberTrialOutlook, trialCountries, verifiedPhone } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { numbersConfigured, requestIpHash } from "@/lib/telephony";

export const dynamic = "force-dynamic";

// Where we sell numbers, where a free trial number is available, and the
// country the business's time zone points to, which the phone step starts on.
// Only hosted businesses verify a phone, and only while a free trial number is
// still possible: a live plan, a used trial or a market without trial numbers
// goes to the number step, which shows the plans instead. The claim keeps
// enforcing every number rule itself.
export const GET = operatorRoute(async ({ request, userId, businessId, transaction, domain }) => {
  const { business, verified } = await transaction(async (tx) => ({
    business: (await tx.select({ timezone: businesses.timezone, deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0],
    verified: await verifiedPhone(tx, { userId, businessId }),
  }));
  const suggestedCountry = countryCodeForBusinessTimezone(business?.timezone) ?? null;
  const trial = await onboardingNumberTrialOutlook(domain, { userId, businessId, ipHash: numbersConfigured() ? requestIpHash(request) : null });
  // verifiedPhone lets an owner who comes back see the phone they already verified.
  return NextResponse.json({ countries: numberCountries(), trialCountries: trialCountries(), suggestedCountry, verifyPhone: trial.verificationNeeded, trialRefusal: trial.refusal, verifiedPhone: verified?.phone ?? null });
});

// An owner in a country without numbers asks to hear when numbers arrive there.
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.countryCode !== "string") return jsonError("countryCode is required.", 400);
  await joinNumberWaitlist(domain, { userId, businessId, countryCode: body.countryCode });
  return NextResponse.json({ joined: true });
});
