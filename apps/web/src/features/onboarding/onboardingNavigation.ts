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
