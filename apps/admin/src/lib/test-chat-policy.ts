import { enforceFixedWindow, fixedWindowLimit, type FixedWindowResult } from "./fixed-window-limit";

const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

/** A test chat counts against no allowance, so these limits alone cap what it costs. */
export async function enforceTestChatRateLimits(input: { businessId: string; userId: string }): Promise<FixedWindowResult> {
  return await enforceFixedWindow([
    fixedWindowLimit("test-chat", "user-minute", `${input.businessId}:${input.userId}`, 10, minute, "rate_limit_user_minute"),
    fixedWindowLimit("test-chat", "business-hour", input.businessId, 60, hour, "rate_limit_business_hour"),
    fixedWindowLimit("test-chat", "business-day", input.businessId, 200, day, "rate_limit_business_day"),
    fixedWindowLimit("test-chat", "global-minute", "global", 120, minute, "rate_limit_global"),
  ]);
}
