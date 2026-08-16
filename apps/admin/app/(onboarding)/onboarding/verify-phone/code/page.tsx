import { OnboardingPhoneVerificationCodeSurface } from "@/components/onboarding-phone-verification-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingVerifyPhoneCodePage() { await requireOnboardingStage("/onboarding/verify-phone/code"); return <OnboardingPhoneVerificationCodeSurface />; }
