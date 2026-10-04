import "server-only";

import { enforceFixedWindow, fixedWindowLimit } from "./fixed-window-limit";

export async function assertPhoneNumberSearchAllowed(input: { userId: string; initial: boolean }): Promise<void> {
  const name = input.initial ? "initial-10m" : "search-10m";
  const result = await enforceFixedWindow([fixedWindowLimit("phone-number-search", name, input.userId, input.initial ? 10 : 20, 600, "rate_limit_user")]);
  if (result.allowed) return;
  throw new Error(result.status === 429 ? "Too many number searches. Try again later." : "Phone number search protection is unavailable.");
}
