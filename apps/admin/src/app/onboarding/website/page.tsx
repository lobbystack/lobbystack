"use client";

import { OnboardingWebsitePage } from "@/features/onboarding/OnboardingWebsitePage";

export default function OnboardingWebsiteRoutePage() {
  return <OnboardingWebsitePage onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST" })} />;
}
