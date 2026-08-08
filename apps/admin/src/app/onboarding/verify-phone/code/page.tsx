"use client";

import { OnboardingVerifyPhoneCodePage } from "@/features/onboarding/OnboardingVerifyPhoneCodePage";

export default function OnboardingVerifyPhoneCodeRoutePage() {
  return (
    <OnboardingVerifyPhoneCodePage
      approvedRedirectTo="/onboarding/plan"
      onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST" })}
      phoneE164=""
    />
  );
}
