"use client";

import { OnboardingKnowledgePage } from "@/features/onboarding/OnboardingKnowledgePage";

export default function OnboardingKnowledgeRoutePage() {
  return <OnboardingKnowledgePage onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST" })} />;
}
