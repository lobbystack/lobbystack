import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveOnboardingState, resolveOnboardingRoute, type OnboardingStage, type OnboardingState } from "@lobbystack/domain";
import { ONBOARDING_READING_ROUTE } from "@lobbystack/shared";

import { getAppDatabase } from "./api-helpers";
import { getSession } from "./auth";
import { initialBrandingFields, type InitialBrandingFields } from "./onboarding-branding";
import { NO_BUSINESSES_PATH, requestBrandScope } from "./request-brand";

const BRAND_ROUTE = "/onboarding/brand";

const routeStages: Record<string, OnboardingStage> = {
  "/onboarding/business": "create_business",
  "/onboarding/website": "website",
  "/onboarding/language": "language",
  // The wait opens once the website step has moved the stage on.
  [ONBOARDING_READING_ROUTE]: "verify_phone",
  "/onboarding/verify-phone": "verify_phone",
  "/onboarding/number": "phone_number",
  "/onboarding/goal": "goal",
  "/onboarding/attribution": "attribution",
  "/onboarding/meet": "meet",
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
  // "Create workspace" in the switcher opens this step for someone whose current workspace is done, not for one still mid-onboarding.
  const addsWorkspace = state.businessId !== null && state.stage === "complete" && state.steps.includes("create_business");
  if (options.allowCreate && expected === "create_business" && (state.businessId === null || addsWorkspace)) return;
  // A partner's business skips some steps, such as creating it, the number, the goal and attribution.
  if (!state.steps.includes(expected)) redirect(current);
  // Onboarding goes forward only: a browser back or an old link to an earlier
  // step lands on the step the workspace is on. The number picker stays open
  // from later steps, since the dashboard uses it to add a number.
  const revisitsNumber = expected === "phone_number" && ["phone_number_claiming", "goal", "attribution", "meet", "complete"].includes(state.stage);
  // The number search can still ask for a mobile when the pre-check missed a
  // signal, and the phone step is the only place to verify it.
  const returnsToVerifyPhone = expected === "verify_phone" && state.stage === "phone_number";
  if (state.stage !== expected && !revisitsNumber && !returnsToVerifyPhone) redirect(current);
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
