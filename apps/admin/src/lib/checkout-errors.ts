import { billingErrorCodes } from "@lobbystack/shared";

export function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
}

/** The settings-namespace message for a checkout the server refused, or null for any other failure. */
export function checkoutRefusalKey(error: unknown): string | null {
  const code = errorCode(error);
  if (code === billingErrorCodes.checkoutInProgress) return "billing.checkoutErrors.inProgress";
  if (code === billingErrorCodes.subscriptionActive) return "billing.checkoutErrors.subscriptionActive";
  return null;
}
