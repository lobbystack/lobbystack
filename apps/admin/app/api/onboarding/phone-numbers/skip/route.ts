import { NextResponse } from "next/server";

import { skipOnboardingNumber } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";
import { trustedClientCountry } from "@/lib/trusted-client-ip";

// The number step's way on without a number. The country the owner picked
// comes along, so the domain can check that we sell no numbers there, and so
// does the request's trusted country, which can rule out any way on.
export const POST = operatorRoute(async ({ request, userId, businessId, body, domain }) => {
  const countryCode = typeof body.countryCode === "string" ? body.countryCode : null;
  await skipOnboardingNumber(domain, { userId, businessId, countryCode, ipCountry: trustedClientCountry(request) });
  return NextResponse.json({ ok: true });
});
