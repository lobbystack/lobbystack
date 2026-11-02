import { OnboardingReadingSurface } from "@/components/onboarding-reading-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingReadingPage() { await requireOnboardingStage("/onboarding/reading"); return <OnboardingReadingSurface />; }
