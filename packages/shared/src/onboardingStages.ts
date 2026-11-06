export const onboardingStages = ["create_business", "website", "language", "verify_phone", "phone_number", "phone_number_claiming", "goal", "attribution", "meet", "complete"] as const;

export type OnboardingStage = (typeof onboardingStages)[number];

/** Who a business belongs to, as onboarding sees it: the host directly, or a partner at an access level. */
export type OnboardingBusiness = { partnerId: string | null; accessLevel: "full" | "activity" };

const stageRoutes: Record<OnboardingStage, string> = {
  create_business: "/onboarding/business",
  website: "/onboarding/website",
  language: "/onboarding/language",
  verify_phone: "/onboarding/verify-phone",
  phone_number: "/onboarding/number",
  phone_number_claiming: "/onboarding/number",
  goal: "/onboarding/goal",
  attribution: "/onboarding/attribution",
  meet: "/onboarding/meet",
  complete: "/",
};

/** The wait screen has no stage: the website step has already moved on, and the import runs behind it. */
export const ONBOARDING_READING_ROUTE = "/onboarding/reading";

const directSteps: readonly OnboardingStage[] = ["create_business", "website", "language", "verify_phone", "phone_number", "goal", "attribution", "meet"];
const partnerSteps: readonly OnboardingStage[] = ["website", "language", "verify_phone", "meet"];
const activitySteps: readonly OnboardingStage[] = ["verify_phone"];

/**
 * The stages a business's owner goes through, in order. Without a business
 * yet, they're a direct owner's, who starts by creating one. A partner's
 * business skips what the partner or host does: creating it, its number, the
 * goal and attribution. At the activity level the partner sets the agent up,
 * so the phone is the owner's only step.
 */
export function onboardingSteps(business: OnboardingBusiness | null): readonly OnboardingStage[] {
  if (!business?.partnerId) return directSteps;
  return business.accessLevel === "activity" ? activitySteps : partnerSteps;
}

// The steps that left onboarding. A workspace parked on one resumes at the
// next step that still exists: the plan, Documents, the greeting and the test
// call all came before verifying a phone. Old code keeps writing some of these
// until the release finishes, so this stays until no old admin can run.
const legacyStages: Record<string, OnboardingStage> = { plan: "verify_phone", verify_phone_code: "verify_phone", knowledge: "verify_phone", greeting: "verify_phone", test_call: "verify_phone" };

/** The stored stages this mapping covers, for writes that match the stored value. */
export const LEGACY_ONBOARDING_STAGES: readonly string[] = Object.keys(legacyStages);

export function isOnboardingStage(value: unknown): value is OnboardingStage {
  return typeof value === "string" && Object.hasOwn(stageRoutes, value);
}

export function normalizeOnboardingStage(value: unknown): OnboardingStage {
  if (isOnboardingStage(value)) return value;
  if (typeof value === "string" && Object.hasOwn(legacyStages, value)) return legacyStages[value]!;
  return "create_business";
}

export function resolveOnboardingRoute(stage: string | null | undefined): string {
  return stageRoutes[normalizeOnboardingStage(stage ?? "create_business")];
}

// Claiming a number is the number step, so the two share a place.
function stagePlace(stage: OnboardingStage): number {
  return onboardingStages.indexOf(stage === "phone_number_claiming" ? "phone_number" : stage);
}

export function canVisitOnboardingStage(current: OnboardingStage, target: OnboardingStage): boolean {
  return stagePlace(target) <= stagePlace(current);
}

/**
 * The step dots after sign-up, which is the first dot on every direct path.
 * The language question and the wait screen answer the website step, so they
 * share its dot, and both paths show the same count.
 */
const DIRECT_DOTS = ["/onboarding/business", "/onboarding/website", "/onboarding/verify-phone", "/onboarding/number", "/onboarding/goal", "/onboarding/attribution", "/onboarding/meet"] as const;
const PARTNER_DOTS = ["/onboarding/website", "/onboarding/verify-phone", "/onboarding/meet"] as const;

/** The dots sign-up and every later direct step show. */
export const ONBOARDING_DOT_COUNT = DIRECT_DOTS.length + 1;

const dotRoute = (route: string) => route === "/onboarding/language" || route === ONBOARDING_READING_ROUTE ? "/onboarding/website" : route === "/onboarding/brand" ? "/onboarding/business" : route;

export type OnboardingProgress = { current: number; total: number };

/** The dots for a step, or null when the owner has only one step or the page isn't one of theirs. */
export function onboardingProgress(pathname: string, partnerAccessLevel: "full" | "activity" | null | undefined): OnboardingProgress | null {
  if (partnerAccessLevel === "activity") return null;
  // Sign-up counts as a dot but has no page of its own.
  const routes: readonly string[] = partnerAccessLevel === "full" ? PARTNER_DOTS : ["", ...DIRECT_DOTS];
  const current = routes.indexOf(dotRoute(pathname)) + 1;
  if (current === 0) return null;
  return { current, total: routes.length };
}
