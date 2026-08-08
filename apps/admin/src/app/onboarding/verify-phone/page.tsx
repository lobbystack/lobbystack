"use client";

import { OnboardingVerifyPhonePage } from "@/features/onboarding/OnboardingVerifyPhonePage";

export default function OnboardingVerifyPhoneRoutePage() {
  return <OnboardingVerifyPhonePage onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST" })} />;
}
