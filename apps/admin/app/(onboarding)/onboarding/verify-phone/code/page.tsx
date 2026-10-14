import { requireOnboardingStage } from "@/lib/onboarding-route";

// The code is now entered on /onboarding/verify-phone. Keep the old route as a
// compatibility redirect to the caller's current onboarding step.
export default async function OnboardingVerifyPhoneCodeRedirectPage() {
  await requireOnboardingStage("/onboarding/verify-phone/code");
  return null;
}
