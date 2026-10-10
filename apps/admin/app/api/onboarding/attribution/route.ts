import { NextResponse } from "next/server";

import { submitOnboardingAttribution } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const source = typeof body.source === "string" ? body.source : null;
  const referralCode = typeof body.referralCode === "string" ? body.referralCode : null;
  await submitOnboardingAttribution(domain, { userId, businessId, source, referralCode });
  return NextResponse.json({ ok: true, stage: "complete" });
});
