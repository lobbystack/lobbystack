import "server-only";

import { enforceFixedWindow, fixedWindowLimit } from "./fixed-window-limit";

const hour = 60 * 60;

export async function assertFeedbackSubmissionAllowed(input: { userId: string; businessId?: string }): Promise<void> {
  const limits = [fixedWindowLimit("feedback", "user-hour", input.userId, 10, hour, "rate_limit_user_hour")];
  if (input.businessId) limits.push(fixedWindowLimit("feedback", "business-hour", input.businessId, 50, hour, "rate_limit_business_hour"));
  const result = await enforceFixedWindow(limits);
  if (result.allowed) return;
  throw new Error(result.status === 429 ? "Too many feedback submissions. Please try again later." : "Feedback abuse protection is unavailable.");
}
