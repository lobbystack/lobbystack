import { OnboardingBusinessSurface } from "@/components/onboarding-business-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingBusinessPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) { const params = await searchParams; const createNew = params.create === "true"; await requireOnboardingStage("/onboarding/business", { allowCreate: createNew }); return <OnboardingBusinessSurface createNew={createNew} />; }
