"use client";

import { OnboardingBusinessNamePage } from "@/features/onboarding/OnboardingBusinessNamePage";

export default function OnboardingBusinessRoutePage() {
  return <OnboardingBusinessNamePage onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST" })} />;
}
