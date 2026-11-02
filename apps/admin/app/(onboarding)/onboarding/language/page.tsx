import { OnboardingLanguageSurface } from "@/components/onboarding-language-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingLanguagePage() { await requireOnboardingStage("/onboarding/language"); return <OnboardingLanguageSurface />; }
