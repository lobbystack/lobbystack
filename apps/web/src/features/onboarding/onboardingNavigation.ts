const onboardingStageSteps: Record<string, number> = {
  create_business: 2,
  website: 3,
  knowledge: 4,
  greeting: 5,
  verify_phone: 6,
  verify_phone_code: 7,
  plan: 8,
  phone_number: 9,
  phone_number_claiming: 9,
  attribution: 10,
  completed: 11,
};

type OnboardingBillingPlan =
  | "free_cloud"
  | "self_host"
  | "starter"
  | "pro"
  | "enterprise";

export function onboardingStageNeedsBillingPlan(stage: string | undefined): boolean {
  return stage === "phone_number" || stage === "phone_number_claiming";
}

export function getOnboardingRouteForStage(
  stage: string | undefined,
  billingPlan?: OnboardingBillingPlan,
): string | null {
  // The plan step was inserted before number selection. Workspaces persisted
  // at a number stage by the old flow must choose a plan before continuing.
  if (onboardingStageNeedsBillingPlan(stage) && billingPlan === "free_cloud") {
    return "/onboarding/plan";
  }

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
    default:
      return null;
  }
}

export function canVisitOnboardingStage(
  currentStage: string | undefined,
  targetStage: string,
): boolean {
  const currentStep = currentStage ? onboardingStageSteps[currentStage] : undefined;
  const targetStep = onboardingStageSteps[targetStage];

  return currentStep !== undefined && targetStep !== undefined && targetStep <= currentStep;
}

export function onboardingNavigableStep(stage: string | undefined): number {
  return stage ? (onboardingStageSteps[stage] ?? 1) : 1;
}

export function getPhoneVerificationApprovedRedirect(
  onboardingStage: string | undefined,
): "/onboarding/number" | "/onboarding/plan" {
  return onboardingStage === "completed" ? "/onboarding/number" : "/onboarding/plan";
}
