import type { OnboardingGoal } from "@lobbystack/domain";

/**
 * Whether Home shows the new-account view. The first real conversation ends it
 * for good: its row is never deleted, so a business can't go back. Only people
 * who can act on the steps see them. An activity-only business leaves setup to
 * its partner, and only owners and admins claim numbers and change the agent.
 * Everyone else keeps the normal Home.
 */
export function showsNewAccountHome({ canSetUp, firstRealConversationAt, role }: { canSetUp: boolean; firstRealConversationAt: string | null | undefined; role: string | undefined }): boolean {
  return firstRealConversationAt === null && canSetUp && (role === "business_owner" || role === "business_admin");
}

export type StageId = "hear" | "teach" | "number";

/** The stage to open: the first one not done, ending on the number, since nothing here can tell when forwarding is on. */
export function currentStage(done: { hear: boolean; teach: boolean }): StageId {
  if (!done.hear) return "hear";
  if (!done.teach) return "teach";
  return "number";
}

export type TeachTask = "knowledge" | "hours" | "calendar" | "services" | "widget" | "instagram";

export const TEACH_TASK_LINKS: Record<TeachTask, string> = {
  knowledge: "/agent/knowledge",
  hours: "/agent/basic-settings",
  calendar: "/integrations",
  services: "/agent/services",
  widget: "/widget",
  instagram: "/integrations",
};

/** What to teach the agent first, from the owner's goal. With no answer it follows the phone, the channel every business can use. */
export function teachTasks(goal: OnboardingGoal | null, widgetsEnabled: boolean): TeachTask[] {
  if (goal === "book_appointments") return ["calendar", "services", "knowledge"];
  if (goal === "answer_website_visitors") return widgetsEnabled ? ["widget", "knowledge"] : ["knowledge", "hours"];
  if (goal === "answer_instagram_messages") return ["instagram", "knowledge"];
  return ["knowledge", "hours"];
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
