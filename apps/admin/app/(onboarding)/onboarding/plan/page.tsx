import { redirect } from "next/navigation";

import { OnboardingPlanSurface } from "@/components/onboarding-plan-surface";
import { requireOnboardingStage } from "@/lib/onboarding-route";

/**
 * Checkout success links opened before the success page existed still come
 * here with `checkout=success` and the request to confirm. The result belongs
 * to the success page, so send the visit on with the request id it reads.
 */
export default async function OnboardingPlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.checkout === "success") {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (name === "checkout" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) query.append(name, item);
    }
    redirect(`/billing/success${query.size > 0 ? `?${query.toString()}` : ""}`);
  }
  await requireOnboardingStage("/onboarding/plan");
  return <OnboardingPlanSurface />;
}
