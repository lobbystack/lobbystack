/**
 * Whether Home can show the setup guide. The first real conversation ends it
 * for good: its row is never deleted, so a business can't go back. Only people
 * who can act on the steps see them. An activity-only business leaves setup to
 * its partner, and only owners and admins claim numbers and change the agent.
 * Everyone else keeps the normal Home.
 */
export function showsSetupGuide({ canSetUp, firstRealConversationAt, role }: { canSetUp: boolean; firstRealConversationAt: string | null | undefined; role: string | undefined }): boolean {
  return firstRealConversationAt === null && canSetUp && (role === "business_owner" || role === "business_admin");
}

export type SetupStepId = "fullScan" | "sources" | "testCall" | "phoneNumber";

/** Every account gets this order. The goal changes a step's wording, never its place. */
export const SETUP_STEP_ORDER: readonly SetupStepId[] = ["fullScan", "sources", "testCall", "phoneNumber"];

export type SetupStep = { id: SetupStepId; status: string; documentId?: string | null };
export type SetupGuide = { steps: SetupStep[]; skippedSteps: string[] };

/**
 * Whether a step needs nothing more. Having a number doesn't finish the number
 * step: a number answers nobody until the owner forwards their line, and that
 * happens at their carrier, where nothing here can see it. Skipping is the only
 * way to finish that step.
 */
export function isSetupStepDone(step: SetupStep, skippedSteps: readonly string[]): boolean {
  if (step.status === "needs setup") return false;
  return step.id !== "phoneNumber" || skippedSteps.includes(step.id);
}

/** Whether the operator is through with the list, so Home goes back to normal. */
export function isSetupGuideFinished({ skippedSteps, steps }: SetupGuide): boolean {
  return steps.every((step) => isSetupStepDone(step, skippedSteps));
}

export type NumberPath = "claim" | "trial" | "verify" | "plan" | "partnerLimit" | "partnerUnavailable" | "unavailable";

type NumberAccess = {
  /** From a partner's business's number response; null for a direct business. */
  partnerNumbers: { available: boolean; trial?: boolean; refusal?: string | null; phoneVerified?: boolean } | null | undefined;
  trialAvailable: boolean;
  /** How many numbers the plan includes, null for no limit, undefined when the person can't read billing. */
  includedNumbers: number | null | undefined;
};

/** How a business with no number gets one. */
export function numberPath({ includedNumbers, partnerNumbers, trialAvailable }: NumberAccess): NumberPath {
  if (partnerNumbers) {
    if (!partnerNumbers.available) return partnerNumbers.refusal === "partner_number_limit_reached" ? "partnerLimit" : "partnerUnavailable";
    return partnerNumbers.trial && partnerNumbers.phoneVerified === false ? "verify" : "claim";
  }
  if (trialAvailable) return "trial";
  if (includedNumbers === undefined) return "unavailable";
  return includedNumbers === null || includedNumbers > 0 ? "claim" : "plan";
}
