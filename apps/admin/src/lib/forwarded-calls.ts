import { recordForwardedCall, type ForwardingSource } from "@lobbystack/domain";

import { createWorkerDomainContext } from "./domain-context";

/**
 * Notes a call forwarded to a business's number, so Getting started's
 * forwarding step finishes on its own. Never fails or slows the call: the
 * carrier is waiting on the webhook's answer, so callers don't wait on it.
 */
export async function noteForwardedCall(input: { businessId: string; dialled: string; from?: string | null | undefined; candidates: readonly string[]; source: ForwardingSource }): Promise<void> {
  if (!input.candidates.length) return;
  try {
    await recordForwardedCall(createWorkerDomainContext(), input);
  } catch (error) {
    console.error("[forwarding] couldn't note a forwarded call", error instanceof Error ? error.message : error);
  }
}
