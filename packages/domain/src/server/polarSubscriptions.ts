import { liveSubscriptionStates } from "@lobbystack/shared";

/** What one Polar event does to the billing account its customer names. */
export type SubscriptionEventEffect = "apply" | "end" | "ignore";

/** Whether a Polar subscription state gives access to what it sells. */
export function isLivePolarSubscriptionState(state: string | null | undefined): boolean {
  return (liveSubscriptionStates as readonly string[]).includes(state ?? "");
}

/**
 * Polar lets one customer hold several subscriptions: a hosted plan beside a
 * self-hosted support plan, or an old plan's subscription beside the one that
 * replaced it. A business's or partner's billing account follows one of them,
 * the subscription it stores, and matches events to it by subscription ID,
 * never by customer. So an event changes the account only when it's about that
 * subscription, or about a live plan or tier that replaces it.
 *
 * A support plan sells no plan or tier, and neither does a product from the
 * other catalog: a business's plan on a partner's subscription, or a partner's
 * tier on a business's. When the stored subscription moves to one in Polar's
 * portal, the hosted plan or tier ends ("end"). Any other such subscription
 * leaves the account alone ("ignore"), so buying support with the same email
 * can't turn a lapsed plan back on, and cancelling support can't end one.
 */
export function subscriptionEventEffect(input: {
  storedSubscriptionId: string | null | undefined;
  eventSubscriptionId: string | undefined;
  /** Whether the subscription's product sells this account nothing: a support plan, or the other catalog's product. */
  sellsNothing: boolean;
  /** Whether the event is about a live plan or tier this deployment sells. */
  startsLivePlan: boolean;
}): SubscriptionEventEffect {
  const stored = input.storedSubscriptionId ?? undefined;
  const ownSubscription = input.eventSubscriptionId !== undefined && input.eventSubscriptionId === stored;
  if (input.sellsNothing) return ownSubscription ? "end" : "ignore";
  if (!input.eventSubscriptionId || !stored || ownSubscription) return "apply";
  return input.startsLivePlan ? "apply" : "ignore";
}
