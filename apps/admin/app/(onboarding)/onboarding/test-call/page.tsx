import { OnboardingTestCallSurface } from "@/components/onboarding-test-call-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingTestCallPage() { await requireOnboardingStage("/onboarding/test-call"); return <OnboardingTestCallSurface />; }
