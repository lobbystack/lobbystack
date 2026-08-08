"use client";

import { OnboardingGreetingPage } from "@/features/onboarding/OnboardingGreetingPage";

export default function OnboardingGreetingRoutePage() {
  return (
    <OnboardingGreetingPage
      onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST" })}
      businessName=""
    />
  );
}
