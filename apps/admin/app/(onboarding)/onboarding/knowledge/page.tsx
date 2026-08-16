import { OnboardingKnowledgeSurface } from "@/components/onboarding-knowledge-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingKnowledgePage() { await requireOnboardingStage("/onboarding/knowledge"); return <OnboardingKnowledgeSurface />; }
