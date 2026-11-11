import { NextResponse } from "next/server";

import { advanceOnboardingStage, isOnboardingStage } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// Moves onboarding to its next step. Only a partner's business can be moved
// to complete here, since its owner finishes at their phone; the domain
// refuses it for a direct business, which finishes through attribution.
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  // A tab from before the goal question left onboarding moves on from the number with "goal". What followed it is attribution.
  const target = body.to === "goal" ? "attribution" : body.to;
  if (!isOnboardingStage(target) || target === "create_business") {
    return jsonError("A valid next onboarding stage is required.", 400);
  }
  // The stage it's on after: leaving Meet your agent can open the plans instead of finishing.
  const stage = await advanceOnboardingStage(domain, { userId, businessId, to: target });
  return NextResponse.json({ ok: true, stage });
});
