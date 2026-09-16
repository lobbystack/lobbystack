import { OnboardingAttributionSurface } from "@/components/onboarding-attribution-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingAttributionPage() { await requireOnboardingStage("/onboarding/attribution"); return <OnboardingAttributionSurface />; }
