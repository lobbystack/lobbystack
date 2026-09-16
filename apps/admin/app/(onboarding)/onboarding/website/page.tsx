import { OnboardingWebsiteSurface } from "@/components/onboarding-website-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingWebsitePage() { await requireOnboardingStage("/onboarding/website"); return <OnboardingWebsiteSurface />; }
