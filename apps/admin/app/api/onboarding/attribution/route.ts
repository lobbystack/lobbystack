import { NextResponse } from "next/server";

import { readOnboardingAttribution, submitOnboardingAttribution } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** The answer already saved, for someone who comes back to this step. */
export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json({ source: await readOnboardingAttribution(domain, { userId, businessId }) }));

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const source = typeof body.source === "string" ? body.source : null;
  const referralCode = typeof body.referralCode === "string" ? body.referralCode : null;
  await submitOnboardingAttribution(domain, { userId, businessId, source, referralCode });
  return NextResponse.json({ ok: true });
});
