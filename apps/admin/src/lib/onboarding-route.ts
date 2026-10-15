import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { canVisitOnboardingStage, getActiveOnboardingState, numberStepRedirect, resolveOnboardingRoute, type OnboardingStage } from "@lobbystack/domain";

import { getAppDatabase } from "./api-helpers";
import { getSession } from "./auth";

const routeStages: Record<string, OnboardingStage> = {
  "/onboarding/business": "create_business",
  "/onboarding/website": "website",
  "/onboarding/knowledge": "knowledge",
  "/onboarding/greeting": "greeting",
  "/onboarding/test-call": "test_call",
  "/onboarding/verify-phone": "verify_phone",
  "/onboarding/number": "phone_number",
  "/onboarding/attribution": "attribution",
};

export async function requireOnboardingStage(pathname: string, options: { allowCreate?: boolean } = {}): Promise<void> {
  const session = await getSession(new Headers(await headers()));
  if (!session) redirect("/login");
  const state = await getActiveOnboardingState(getAppDatabase().db, session.user.id);
  const expected = routeStages[pathname];
  if (!expected) redirect(resolveOnboardingRoute(state.stage));
  if (options.allowCreate && expected === "create_business" && state.businessId === null) return;
  if (!canVisitOnboardingStage(state.stage, expected)) redirect(resolveOnboardingRoute(state.stage));
  if (expected === "phone_number" && state.businessId) {
    const elsewhere = await numberStepRedirect({ db: getAppDatabase().db }, { userId: session.user.id, businessId: state.businessId, finished: state.stage === "complete" });
    if (elsewhere) redirect(elsewhere);
  }
}
