import { NextResponse } from "next/server";

import { skipOnboardingNumber } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

// The number step's way on without a number. The country the owner picked
// comes along, so the domain can check that we sell no numbers there.
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const countryCode = typeof body.countryCode === "string" ? body.countryCode : null;
  await skipOnboardingNumber(domain, { userId, businessId, countryCode });
  return NextResponse.json({ ok: true });
});
