import { OnboardingVerifyPhoneSurface } from "@/components/onboarding-verify-phone-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingVerifyPhonePage() { await requireOnboardingStage("/onboarding/verify-phone"); return <OnboardingVerifyPhoneSurface />; }
