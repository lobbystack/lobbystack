import { reportError } from "@lobbystack/telemetry/node";

/**
 * Reports a server error to PostHog error tracking, with the IDs of the call
 * the request handled when there is one. See reportError() for the redaction.
 */
export async function reportServerError(error: unknown, context: { operation: string; route?: string; method?: string; digest?: string; errorId?: string }): Promise<void> {
  await reportError(error, context);
}
