import type { CustomDomainStatus, PackageSubscriptionStatus, PartnerStripeStatus } from "@lobbystack/shared";

import type { StatusVariant } from "@/components/ui/status";

/**
 * One map per record whose state shows as a Status chip, so a state reads
 * the same on every page. Unknown values fall back to neutral.
 */
function lookup<T extends string>(map: Record<T, StatusVariant>) {
  return (status: string | null | undefined): StatusVariant => (status ? (map as Record<string, StatusVariant>)[status.toLowerCase()] : undefined) ?? "neutral";
}

export const APPOINTMENT_STATUS_VARIANTS = {
  booked: "success",
  confirmed: "success",
  pending: "warning",
  completed: "neutral",
  no_show: "warning",
  canceled: "danger",
  cancelled: "danger",
} satisfies Record<string, StatusVariant>;
export const appointmentStatusVariant = lookup(APPOINTMENT_STATUS_VARIANTS);

/** What came of a call, as the contact's activity sums it up. */
export const CALL_OUTCOME_VARIANTS = {
  in_progress: "info",
  completed: "success",
  failed: "danger",
  blocked: "danger",
} satisfies Record<string, StatusVariant>;
export const callOutcomeVariant = lookup(CALL_OUTCOME_VARIANTS);

/** A request in the home page's action list: its kind is neutral, an urgent one is danger. */
export const REQUEST_STATUS_VARIANTS = {
  kind: "neutral",
  urgent: "danger",
} satisfies Record<string, StatusVariant>;

export const PACKAGE_SUBSCRIPTION_STATUS_VARIANTS: Record<PackageSubscriptionStatus, StatusVariant> = {
  active: "success",
  awaiting_payment: "warning",
  past_due: "danger",
  inactive: "neutral",
};
export const packageSubscriptionStatusVariant = lookup(PACKAGE_SUBSCRIPTION_STATUS_VARIANTS);

export const STRIPE_ACCOUNT_STATUS_VARIANTS: Record<PartnerStripeStatus, StatusVariant> = {
  active: "success",
  onboarding: "warning",
  restricted: "danger",
  not_connected: "neutral",
  disconnected: "neutral",
};

export const AFFILIATE_STATUS_VARIANTS = {
  draft: "neutral",
  pending: "warning",
  ready: "info",
  paid: "success",
  voided: "danger",
  skipped: "neutral",
} satisfies Record<string, StatusVariant>;
export const affiliateStatusVariant = lookup(AFFILIATE_STATUS_VARIANTS);

/** Invitations to a workspace or partner team, and a business owner's. */
export const INVITATION_STATUS_VARIANTS = {
  pending: "warning",
  invited: "warning",
  expired: "neutral",
  handover: "info",
} satisfies Record<string, StatusVariant>;

export const CUSTOM_DOMAIN_STATUS_VARIANTS: Record<CustomDomainStatus, StatusVariant> = {
  active: "success",
  pending: "warning",
  failed: "danger",
};

export const WIDGET_KEY_STATUS_VARIANTS = {
  active: "success",
  disabled: "warning",
  revoked: "neutral",
} satisfies Record<string, StatusVariant>;

export const WEBHOOK_DELIVERY_STATUS_VARIANTS = {
  pending: "neutral",
  retrying: "warning",
  succeeded: "success",
  failed: "danger",
  skipped: "neutral",
} satisfies Record<string, StatusVariant>;
export const webhookDeliveryStatusVariant = lookup(WEBHOOK_DELIVERY_STATUS_VARIANTS);

/** Knowledge entries, services and rules: ready, still being read, failed, or turned off. */
export const KNOWLEDGE_STATUS_VARIANTS = {
  indexed: "success",
  processing: "info",
  in_progress: "info",
  pending: "neutral",
  error: "danger",
  failed: "danger",
  cancelled: "danger",
  disabled: "neutral",
} satisfies Record<string, StatusVariant>;
export const knowledgeStatusVariant = lookup(KNOWLEDGE_STATUS_VARIANTS);

export const EMPLOYEE_STATUS_VARIANTS = {
  working: "success",
  off: "neutral",
  no_services: "danger",
} satisfies Record<string, StatusVariant>;

/** A demo's setup, from reading the website to the prospect claiming it. */
export const DEMO_STATUS_VARIANTS = {
  pending: "neutral",
  queued: "neutral",
  preparing: "info",
  crawling: "info",
  indexing: "info",
  ready: "success",
  active: "success",
  completed: "success",
  claimed: "success",
  missing: "warning",
  unavailable: "warning",
  failed: "danger",
  cancelled: "neutral",
  revoked: "neutral",
  expired: "neutral",
} satisfies Record<string, StatusVariant>;
export const demoStatusVariant = lookup(DEMO_STATUS_VARIANTS);

export const AGENT_STATUS_VARIANTS = {
  paused: "warning",
  removed: "neutral",
} satisfies Record<string, StatusVariant>;

/** A contact's own state: blocked by an operator, or a keypad PIN locked after failed tries. */
export const CONTACT_STATUS_VARIANTS = {
  blocked: "danger",
  locked: "danger",
} satisfies Record<string, StatusVariant>;

/** A package left on the partner's previous Stripe account. */
export const PACKAGE_STATUS_VARIANTS = {
  oldAccount: "warning",
} satisfies Record<string, StatusVariant>;
