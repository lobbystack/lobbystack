"use client";

import { OnboardingPlanPage } from "@/features/onboarding/OnboardingPlanPage";

export default function OnboardingPlanRoutePage() {
  return <OnboardingPlanPage onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST" })} />;
}
