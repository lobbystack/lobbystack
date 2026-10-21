import { OnboardingBrandSurface } from "@/components/onboarding-brand-surface";
import { requireBrandStep } from "@/lib/onboarding-route";

/** The deployment's name and logo, asked of its first owner before their business. */
export default async function OnboardingBrandPage() {
  const fields = await requireBrandStep();
  return <OnboardingBrandSurface askAppName={fields.appName} askLogo={fields.logo} />;
}
