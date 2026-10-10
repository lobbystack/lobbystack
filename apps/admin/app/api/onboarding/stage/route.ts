import { NextResponse } from "next/server";

import { advanceOnboardingStage, isOnboardingStage } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const target = body.to;
  if (!isOnboardingStage(target) || target === "create_business" || target === "complete") {
    return jsonError("A valid next onboarding stage is required.", 400);
  }
  await advanceOnboardingStage(domain, { userId, businessId, to: target });
  return NextResponse.json({ ok: true, stage: target });
});
