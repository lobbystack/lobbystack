import { createStripeConnectProvider, type StripeConnectProvider } from "@lobbystack/providers/stripe/stripeConnect";
import type { DomainContext } from "@lobbystack/domain";

import { configuredAppOrigins } from "./app-origins";
import { partnerRequestOrigin } from "./request-brand";

// The deployment's Stripe Connect client, for the partner console's Stripe
// and Packages pages and the Connect webhook. It exists only when
// STRIPE_CONNECT_SECRET_KEY and STRIPE_CONNECT_WEBHOOK_SECRET are both set,
// as partnerFeatures reports; without it every partner business is billed
// outside LobbyStack.

let provider: { value: StripeConnectProvider | null } | undefined;

export function getStripeConnect(): StripeConnectProvider | null {
  provider ??= { value: createStripeConnectProvider(process.env) };
  return provider.value;
}

/** A domain context that can reach Stripe Connect when the deployment has it. */
export function withStripeConnect(context: DomainContext): DomainContext {
  return { ...context, stripeConnect: getStripeConnect() };
}

/**
 * The origin the console was opened on, for the links Stripe sends the owner
 * back to: the partner's host it was reached on, or the host's own domain.
 */
export function consoleOrigin(headers: Headers): string {
  return partnerRequestOrigin(headers) ?? configuredAppOrigins(process.env)[0] ?? "http://localhost";
}
