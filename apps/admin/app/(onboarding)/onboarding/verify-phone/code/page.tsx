import { requireOnboardingStage } from "@/lib/onboarding-route";

// Personal phone verification was removed from onboarding. Keep the old route
// as a compatibility redirect to the caller's current onboarding step.
export default async function OnboardingVerifyPhoneCodeRedirectPage() {
  await requireOnboardingStage("/onboarding/verify-phone/code");
  return null;
}
