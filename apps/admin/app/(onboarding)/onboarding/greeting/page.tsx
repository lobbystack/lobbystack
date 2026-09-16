import { OnboardingGreetingSurface } from "@/components/onboarding-greeting-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingGreetingPage() { await requireOnboardingStage("/onboarding/greeting"); return <OnboardingGreetingSurface />; }
