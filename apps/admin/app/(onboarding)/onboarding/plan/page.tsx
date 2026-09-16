import { OnboardingPlanSurface } from "@/components/onboarding-plan-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingPlanPage() { await requireOnboardingStage("/onboarding/plan"); return <OnboardingPlanSurface />; }
