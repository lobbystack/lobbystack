import { OnboardingPhoneVerificationSurface } from "@/components/onboarding-phone-verification-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingVerifyPhonePage() { await requireOnboardingStage("/onboarding/verify-phone"); return <OnboardingPhoneVerificationSurface />; }
