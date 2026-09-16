import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { canVisitOnboardingStage, getActiveOnboardingState, resolveOnboardingRoute, type OnboardingStage } from "@lobbystack/domain";

import { getAppDatabase } from "./api-helpers";
import { getSession } from "./auth";

const routeStages: Record<string, OnboardingStage> = {
  "/onboarding/business": "create_business",
  "/onboarding/website": "website",
  "/onboarding/knowledge": "knowledge",
  "/onboarding/greeting": "greeting",
  "/onboarding/verify-phone": "verify_phone",
  "/onboarding/verify-phone/code": "verify_phone_code",
  "/onboarding/plan": "plan",
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
}
