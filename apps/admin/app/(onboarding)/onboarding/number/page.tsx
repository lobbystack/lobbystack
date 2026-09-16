import { OnboardingNumberSurface } from "@/components/onboarding-number-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingNumberPage() { await requireOnboardingStage("/onboarding/number"); return <OnboardingNumberSurface />; }
