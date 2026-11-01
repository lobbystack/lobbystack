import { OnboardingGoalSurface } from "@/components/onboarding-goal-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingGoalPage() { await requireOnboardingStage("/onboarding/goal"); return <OnboardingGoalSurface />; }
