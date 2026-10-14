import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses } from "@lobbystack/db";
import { countryCodeForBusinessTimezone, joinNumberWaitlist, numberCountries, trialCountries } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// Where we sell numbers, where a free trial number is available, and the
// country the business's time zone points to, which the phone step starts on.
// Only hosted businesses verify a phone: it guards the free trial number, which
// self-hosted installs don't offer.
export const GET = operatorRoute(async ({ businessId, transaction }) => {
  const business = await transaction(async (tx) => (await tx.select({ timezone: businesses.timezone, deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0]);
  const suggestedCountry = countryCodeForBusinessTimezone(business?.timezone) ?? null;
  return NextResponse.json({ countries: numberCountries(), trialCountries: trialCountries(), suggestedCountry, verifyPhone: business?.deploymentMode === "cloud" });
});

// An owner in a country without numbers asks to hear when numbers arrive there.
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.countryCode !== "string") return jsonError("countryCode is required.", 400);
  await joinNumberWaitlist(domain, { userId, businessId, countryCode: body.countryCode });
  return NextResponse.json({ joined: true });
});
