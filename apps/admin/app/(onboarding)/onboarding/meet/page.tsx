import { OnboardingMeetSurface } from "@/components/onboarding-meet-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingMeetPage() { await requireOnboardingStage("/onboarding/meet"); return <OnboardingMeetSurface />; }
