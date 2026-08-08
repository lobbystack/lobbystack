"use client";

import { OnboardingAttributionPage } from "@/features/onboarding/OnboardingAttributionPage";

export default function OnboardingAttributionRoutePage() {
  return <OnboardingAttributionPage onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST" })} />;
}
