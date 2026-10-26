import type { DomainContext } from "@lobbystack/domain";
import { createStripeConnectProvider } from "@lobbystack/providers/stripe/stripeConnect";

/**
 * The domain context the worker's jobs run with. It reaches Stripe Connect
 * when STRIPE_CONNECT_SECRET_KEY and STRIPE_CONNECT_WEBHOOK_SECRET are both
 * set, as on the admin, so the partner lifecycle cancels the subscription of
 * each business the host deletes and closes its checkout.
 */
export function createWorkerDomainContext(input: Omit<DomainContext, "stripeConnect">, env: Record<string, string | undefined> = process.env): DomainContext {
  const stripeConnect = createStripeConnectProvider(env);
  return { ...input, ...(stripeConnect ? { stripeConnect } : {}) };
}
