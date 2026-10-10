import { NextResponse } from "next/server";

import { skipOnboardingNumber } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const POST = operatorRoute(async ({ userId, businessId, domain }) => {
  await skipOnboardingNumber(domain, { userId, businessId });
  return NextResponse.json({ ok: true });
});
