import { LivePlanSurface } from "@/components/live-plan-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingPlanPage() { await requireOnboardingStage("/onboarding/plan"); return <LivePlanSurface />; }
