/**
 * Typed onboarding stage progression for the redesigned signup/onboarding flow.
 *
 * The `businesses.onboardingStage` column stays a free-form `v.string()` in
 * the schema for backward compatibility with documents created before this
 * file existed (legacy values: `verify_phone`, `website`, `phone_number`,
 * `phone_number_claiming`, `completed`). All four of those legacy values
 * are still recognised below, plus the new stages introduced for the
 * 10-step flow.
 */

export const ONBOARDING_STAGES = [
  // Step 2 – capture business name and bootstrap tenant.
  "create_business",
  // Step 3 – website ingestion (optional, can skip).
  "website",
  // Step 4 – knowledge base upload / paste text (optional, can skip).
  "knowledge",
  // Step 5 – greeting customisation.
  "greeting",
  // Step 6 – send OTP to user mobile.
  "verify_phone",
  // Step 7 – enter OTP.
  "verify_phone_code",
  // Step 8 – pick a business phone number.
  "phone_number",
  // Transient state while we provision a Twilio number.
  "phone_number_claiming",
  // Step 9 – choose plan (free / pro / enterprise).
  "plan",
  // Step 10 – attribution survey ("how did you hear about us").
  "attribution",
  // All done.
  "completed",
] as const;

export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export const ONBOARDING_STAGE_INDEX: Record<OnboardingStage, number> =
  ONBOARDING_STAGES.reduce(
    (acc, stage, index) => {
      acc[stage] = index;
      return acc;
    },
    {} as Record<OnboardingStage, number>,
  );

export function isKnownOnboardingStage(value: string | undefined | null): value is OnboardingStage {
  return typeof value === "string" && (ONBOARDING_STAGES as readonly string[]).includes(value);
}

/**
 * Coerce a raw stage string to a known stage. Unknown / missing values map
 * to `create_business` so a half-onboarded user always lands on a real step.
 */
export function normalizeOnboardingStage(value: string | undefined | null): OnboardingStage {
  if (isKnownOnboardingStage(value)) {
    return value;
  }
  return "create_business";
}

export function isAtOrBefore(stage: OnboardingStage, target: OnboardingStage): boolean {
  return ONBOARDING_STAGE_INDEX[stage] <= ONBOARDING_STAGE_INDEX[target];
}

export function isCompletedStage(stage: string | undefined | null): boolean {
  return stage === "completed";
}

/**
 * Map an onboarding stage to its dashboard route path. Used by the React
 * router to redirect partially-onboarded users to the right step on
 * refresh or first load.
 */
export function onboardingStageRoute(stage: OnboardingStage): string {
  switch (stage) {
    case "create_business":
      return "/onboarding/business";
    case "website":
      return "/onboarding/website";
    case "knowledge":
      return "/onboarding/knowledge";
    case "greeting":
      return "/onboarding/greeting";
    case "verify_phone":
      return "/onboarding/verify-phone";
    case "verify_phone_code":
      return "/onboarding/verify-phone/code";
    case "phone_number":
    case "phone_number_claiming":
      return "/onboarding/number";
    case "plan":
      return "/onboarding/plan";
    case "attribution":
      return "/onboarding/attribution";
    case "completed":
      return "/";
  }
}
