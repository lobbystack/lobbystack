"use client";

import { OnboardingNumberPage } from "@/features/onboarding/OnboardingNumberPage";

export default function OnboardingNumberRoutePage() {
  return (
    <OnboardingNumberPage
      onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST" })}
      hasReachedAttribution={false}
      isOnboardingComplete={false}
    />
  );
}
