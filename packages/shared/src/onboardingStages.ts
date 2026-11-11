export const onboardingStages = ["create_business", "website", "language", "verify_phone", "phone_number", "phone_number_claiming", "choose_plan", "attribution", "meet", "complete"] as const;

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
  choose_plan: "/onboarding/plan",
  attribution: "/onboarding/attribution",
  meet: "/onboarding/meet",
  complete: "/",
};

/** The wait screen has no stage: the website step has already moved on, and the import runs behind it. */
export const ONBOARDING_READING_ROUTE = "/onboarding/reading";

// A direct owner picks a number right after the website, then a plan when the
// number started a free trial. Only a partner's owner verifies a mobile,
// because the partner's calls forward to it.
const directSteps: readonly OnboardingStage[] = ["create_business", "website", "language", "phone_number", "choose_plan", "attribution", "meet"];
const partnerSteps: readonly OnboardingStage[] = ["website", "language", "verify_phone", "meet"];
const activitySteps: readonly OnboardingStage[] = ["verify_phone"];

/**
 * The stages a business's owner goes through, in order. Without a business
 * yet, they're a direct owner's, who starts by creating one. A partner's
 * business skips what the partner or host does: creating it, its number, the
 * and attribution. At the activity level the partner sets the agent up,
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
// The goal question left later: a workspace parked on it goes on to attribution.
const legacyStages: Record<string, OnboardingStage> = { plan: "verify_phone", verify_phone_code: "verify_phone", knowledge: "verify_phone", greeting: "verify_phone", test_call: "verify_phone", goal: "attribution" };

/** The stored stages this mapping covers, for writes that match the stored value. */
export const LEGACY_ONBOARDING_STAGES: readonly string[] = Object.keys(legacyStages);

/** The legacy stages that read as the phone step, which a direct business reads as the number step. */
export const LEGACY_PHONE_STAGES: readonly string[] = LEGACY_ONBOARDING_STAGES.filter((stage) => legacyStages[stage] === "verify_phone");

export function isOnboardingStage(value: unknown): value is OnboardingStage {
  return typeof value === "string" && Object.hasOwn(stageRoutes, value);
}

/**
 * The stage a stored value stands for. Pass the business when you know it:
 * a direct business has no phone step, so a stored verify_phone, or a legacy
 * stage before it, reads as the number step.
 */
export function normalizeOnboardingStage(value: unknown, business?: { partnerId: string | null } | null): OnboardingStage {
  const stage = isOnboardingStage(value) ? value : typeof value === "string" && Object.hasOwn(legacyStages, value) ? legacyStages[value]! : "create_business";
  return stage === "verify_phone" && business && !business.partnerId ? "phone_number" : stage;
}

/** The step after the website and the language question: the phone for a partner's owner, the number for a direct one. */
export function stageAfterWebsite(business: { partnerId: string | null } | null | undefined): "verify_phone" | "phone_number" {
  return business?.partnerId ? "verify_phone" : "phone_number";
}

export function resolveOnboardingRoute(stage: string | null | undefined): string {
  return stageRoutes[normalizeOnboardingStage(stage ?? "create_business")];
}

// Claiming a number is the number step, so the two share a place.
function stagePlace(stage: OnboardingStage): number {
  return onboardingStages.indexOf(stage === "phone_number_claiming" ? "phone_number" : stage);
}

/** Whether the owner is past the number step: the plans after it, or a later step. */
export function isPastNumberStage(stage: OnboardingStage): boolean {
  return stagePlace(stage) > stagePlace("phone_number");
}

export function canVisitOnboardingStage(current: OnboardingStage, target: OnboardingStage): boolean {
  return stagePlace(target) <= stagePlace(current);
}

/**
 * The step dots after sign-up, which is the first dot on every direct path.
 * The language question and the wait screen answer the website step, so they
 * share its dot, and both paths show the same count.
 */
const DIRECT_DOTS = ["/onboarding/business", "/onboarding/website", "/onboarding/number", "/onboarding/attribution", "/onboarding/meet"] as const;
const PARTNER_DOTS = ["/onboarding/website", "/onboarding/verify-phone", "/onboarding/meet"] as const;

/** The dots sign-up and every later direct step show. */
export const ONBOARDING_DOT_COUNT = DIRECT_DOTS.length + 1;

// The plans after the number share its dot, so the count stays the same with or without a trial.
const dotRoute = (route: string) => route === "/onboarding/language" || route === ONBOARDING_READING_ROUTE ? "/onboarding/website" : route === "/onboarding/brand" ? "/onboarding/business" : route === "/onboarding/plan" ? "/onboarding/number" : route;

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
