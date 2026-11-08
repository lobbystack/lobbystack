import { OnboardingReadingSurface } from "@/components/onboarding-reading-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

export default async function OnboardingReadingPage({ searchParams }: { searchParams: Promise<{ documentId?: string | string[] }> }) {
  const { documentId } = await searchParams;
  await requireOnboardingStage("/onboarding/reading");
  return <OnboardingReadingSurface documentId={typeof documentId === "string" ? documentId : undefined} />;
}
