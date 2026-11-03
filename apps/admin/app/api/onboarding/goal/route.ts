import { NextResponse } from "next/server";

import { isOnboardingGoal, submitOnboardingGoal } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// No goal means the owner skipped the question.
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const goal = body.goal ?? null;
  if (goal !== null && !isOnboardingGoal(goal)) return jsonError("A valid goal is required.", 400);
  await submitOnboardingGoal(domain, { userId, businessId, goal });
  return NextResponse.json({ ok: true });
});
