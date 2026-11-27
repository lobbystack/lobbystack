/**
 * Whether Home can show the setup guide above the dashboard. It stays until
 * every step is done or skipped, real conversations or not. Only people who
 * can act on the steps see them. An activity-only business leaves setup to its
 * partner, and only owners and admins claim numbers and change the agent.
 * Everyone else keeps the normal Home.
 */
export function showsSetupGuide({ canSetUp, role }: { canSetUp: boolean; role: string | undefined }): boolean {
  return canSetUp && (role === "business_owner" || role === "business_admin");
}

export type SetupStepId = "fullScan" | "website" | "sources" | "testCall" | "phoneNumber" | "callNumber" | "forwardCalls";

/**
 * The classic list's order: a partner's business, or a direct one that never
 * had a number. The server sends one of fullScan and website: reading the rest
 * of a site onboarding read, or adding one when it read none.
 */
export const SETUP_STEP_ORDER: readonly SetupStepId[] = ["fullScan", "website", "sources", "testCall", "phoneNumber"];

/** The order for a business that has, or had, a number. The opening hours step, when it shows, goes before the sources. */
export const NUMBER_SETUP_STEP_ORDER: readonly SetupStepId[] = ["fullScan", "callNumber", "forwardCalls", "website", "sources"];

/** The steps the loading list shows: the classic list as onboarding with a website leaves it. */
export const SETUP_SKELETON_STEPS: readonly SetupStepId[] = SETUP_STEP_ORDER.filter((id) => id !== "website");

export type SetupStep = { id: SetupStepId; status: string; documentId?: string | null };
export type SetupGuide = {
  steps: SetupStep[];
  skippedSteps: string[];
  variant?: "classic" | "number";
  forwarding?: { forwardedFrom: string | null; confirmed: boolean };
  /** The trial ended without a plan, so there's no number to call or forward to. */
  numberLost?: boolean;
};

/** The order of the list the server picked. */
export function setupStepOrder(guide: Pick<SetupGuide, "variant"> | undefined): readonly SetupStepId[] {
  return guide?.variant === "number" ? NUMBER_SETUP_STEP_ORDER : SETUP_STEP_ORDER;
}

/**
 * Whether a step needs nothing more. In the classic list, having a number
 * doesn't finish the number step: a number answers nobody until the owner
 * forwards their line, so skipping is the only way to finish it. The number
 * list's forwarding step finishes on the first forwarded call we see.
 */
export function isSetupStepDone(step: SetupStep, skippedSteps: readonly string[]): boolean {
  if (step.status === "needs setup") return false;
  return step.id !== "phoneNumber" || skippedSteps.includes(step.id);
}

/** Whether the operator is through with the list, so Home goes back to normal. */
export function isSetupGuideFinished({ skippedSteps, steps }: SetupGuide): boolean {
  return steps.every((step) => isSetupStepDone(step, skippedSteps));
}

export type NumberPath = "claim" | "trial" | "verify" | "plan" | "partnerLimit" | "partnerUnavailable" | "unavailable" | "restricted";

type NumberAccess = {
  /** From a partner's business's number response; null for a direct business. */
  partnerNumbers: { available: boolean; trial?: boolean; refusal?: string | null; phoneVerified?: boolean } | null | undefined;
  trialAvailable: boolean;
  /** The request comes from a country that gets no number on any plan. */
  numberRestricted?: boolean;
  /** How many numbers the plan includes, null for no limit, undefined when the person can't read billing. */
  includedNumbers: number | null | undefined;
};

/** How a business with no number gets one. */
export function numberPath({ includedNumbers, numberRestricted, partnerNumbers, trialAvailable }: NumberAccess): NumberPath {
  // No plan, partner tier or trial gets a number there.
  if (numberRestricted) return "restricted";
  if (partnerNumbers) {
    if (!partnerNumbers.available) return partnerNumbers.refusal === "partner_number_limit_reached" ? "partnerLimit" : "partnerUnavailable";
    return partnerNumbers.trial && partnerNumbers.phoneVerified === false ? "verify" : "claim";
  }
  if (trialAvailable) return "trial";
  if (includedNumbers === undefined) return "unavailable";
  return includedNumbers === null || includedNumbers > 0 ? "claim" : "plan";
}
