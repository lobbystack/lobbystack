import "server-only";

import { enforceFixedWindow, fixedWindowLimit, type FixedWindowResult } from "./fixed-window-limit";

/** Counts a number search against the person's limit, which the dashboard and API keys acting as them share. */
export async function checkPhoneNumberSearchLimit(input: { userId: string; initial: boolean }): Promise<FixedWindowResult> {
  const name = input.initial ? "initial-10m" : "search-10m";
  return await enforceFixedWindow([fixedWindowLimit("phone-number-search", name, input.userId, input.initial ? 10 : 20, 600, "rate_limit_user")]);
}

export async function assertPhoneNumberSearchAllowed(input: { userId: string; initial: boolean }): Promise<void> {
  const result = await checkPhoneNumberSearchLimit(input);
  if (result.allowed) return;
  throw Object.assign(new Error(result.status === 429 ? "Too many number searches. Try again later." : "Phone number search protection is unavailable."), { status: result.status });
}
