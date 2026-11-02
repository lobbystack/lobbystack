import { requireOnboardingStage } from "@/lib/onboarding-route";

/** A bookmark or an open tab on a step that left onboarding goes to the owner's current step. */
export default async function RemovedOnboardingStepPage(): Promise<never> {
  await requireOnboardingStage("/onboarding/removed");
  throw new Error("An onboarding step that doesn't exist must redirect.");
}
