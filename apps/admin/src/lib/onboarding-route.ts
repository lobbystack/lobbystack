import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { canVisitOnboardingStage, getActiveOnboardingState, numberStepRedirect, resolveOnboardingRoute, type OnboardingStage, type OnboardingState } from "@lobbystack/domain";

import { getAppDatabase } from "./api-helpers";
import { getSession } from "./auth";
import { initialBrandingFields, type InitialBrandingFields } from "./onboarding-branding";
import { NO_BUSINESSES_PATH, requestBrandScope } from "./request-brand";

const BRAND_ROUTE = "/onboarding/brand";

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

/**
 * Where the person's onboarding goes on from here: their business's current
 * step. A partner's domain makes no direct business, so on a partner's host
 * someone with no business there gets the no-businesses page instead.
 */
function currentOnboardingRoute(state: OnboardingState, brand: ReturnType<typeof requestBrandScope>): string {
  return !state.businessId && brand.kind === "partner" ? NO_BUSINESSES_PATH : resolveOnboardingRoute(state.stage);
}

export async function requireOnboardingStage(pathname: string, options: { allowCreate?: boolean } = {}): Promise<void> {
  const requestHeaders = new Headers(await headers());
  const session = await getSession(requestHeaders);
  if (!session) redirect("/login");
  const brand = requestBrandScope(requestHeaders);
  const state = await getActiveOnboardingState(getAppDatabase().db, session.user.id, brand);
  const current = currentOnboardingRoute(state, brand);
  if (current === NO_BUSINESSES_PATH) redirect(current);
  const expected = routeStages[pathname];
  if (!expected) redirect(current);
  // A fresh self-hosted deployment's first owner names it before naming their business.
  if (expected === "create_business" && state.businessId === null && await initialBrandingFields(session.user.id, requestHeaders)) redirect(BRAND_ROUTE);
  if (options.allowCreate && expected === "create_business" && state.businessId === null) return;
  // A partner's business skips some steps, such as creating it, the number and attribution.
  if (!state.steps.includes(expected) || !canVisitOnboardingStage(state.stage, expected)) redirect(current);
  if (expected === "phone_number" && state.businessId) {
    const elsewhere = await numberStepRedirect({ db: getAppDatabase().db }, { userId: session.user.id, businessId: state.businessId, finished: state.stage === "complete" });
    if (elsewhere) redirect(elsewhere);
  }
}

/** The brand step's fields, or a redirect to the person's current step when the step doesn't apply to them. */
export async function requireBrandStep(): Promise<InitialBrandingFields> {
  const requestHeaders = new Headers(await headers());
  const session = await getSession(requestHeaders);
  if (!session) redirect("/login");
  const fields = await initialBrandingFields(session.user.id, requestHeaders);
  if (fields) return fields;
  const brand = requestBrandScope(requestHeaders);
  redirect(currentOnboardingRoute(await getActiveOnboardingState(getAppDatabase().db, session.user.id, brand), brand));
}
