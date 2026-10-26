// A partner bills its businesses through its own Stripe account, connected
// with Stripe Connect (ADR 0009), and sells them packages priced in that
// account's currency. The admin, the worker and the console agree here on
// what a connection's state means and on what a package may hold.

/** Where a partner's Stripe connection stands, as the console's Stripe page shows it. */
export type PartnerStripeStatus =
  /** The partner never connected an account. */
  | "not_connected"
  /** Onboarding started, and the partner hasn't finished giving Stripe its details. */
  | "onboarding"
  /** The partner gave Stripe its details, and Stripe doesn't let the account take payments yet. */
  | "restricted"
  /** The account takes payments. */
  | "active"
  /** The partner disconnected the account from this deployment in Stripe. */
  | "disconnected";

/** What a deployment knows of a partner's connected account. */
export type PartnerStripeAccountState = {
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  disconnectedAt: Date | string | null;
};

export function partnerStripeStatus(account: PartnerStripeAccountState | null): PartnerStripeStatus {
  if (!account) return "not_connected";
  if (account.disconnectedAt) return "disconnected";
  if (account.chargesEnabled) return "active";
  return account.detailsSubmitted ? "restricted" : "onboarding";
}

/**
 * The countries a business can open a Stripe account in, as ISO 3166-1
 * alpha-2 codes. Stripe fixes an account's country when it's created, so the
 * console asks for it before onboarding starts.
 */
export const STRIPE_ACCOUNT_COUNTRIES = [
  "AE", "AT", "AU", "BE", "BG", "BR", "CA", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GI", "GR", "HK", "HR", "HU",
  "IE", "IT", "JP", "LI", "LT", "LU", "LV", "MT", "MX", "MY", "NL", "NO", "NZ", "PL", "PT", "RO", "SE", "SG", "SI", "SK", "TH", "US",
] as const;

export type StripeAccountCountry = (typeof STRIPE_ACCOUNT_COUNTRIES)[number];

export function isStripeAccountCountry(value: unknown): value is StripeAccountCountry {
  return typeof value === "string" && (STRIPE_ACCOUNT_COUNTRIES as readonly string[]).includes(value);
}

export const PARTNER_PACKAGE_NAME_MAX_LENGTH = 80;

/**
 * The largest monthly price or setup fee a package takes, in the currency's
 * smallest unit. Stripe takes at most 8 digits for most currencies and
 * payment methods.
 */
export const PARTNER_PACKAGE_AMOUNT_MAX_MINOR = 99_999_999;

/** The most minutes, or chats, a package's monthly allowance holds. */
export const PARTNER_PACKAGE_ALLOWANCE_MAX = 1_000_000;

// Control, format and line separator characters would let a name rearrange
// or hide the text around it on the partner's invoices and in the console.
const UNSAFE_NAME_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** A package's name as Stripe's invoices show it: 1 to 80 visible characters, whitespace collapsed, or null when the value can't be one. */
export function normalizePackageName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").replace(/\s+/g, " ").trim();
  return name && name.length <= PARTNER_PACKAGE_NAME_MAX_LENGTH && !UNSAFE_NAME_CHARACTERS.test(name) ? name : null;
}

/** Whether a value is a price a package can charge: a whole number of the currency's smallest unit, from 1 to 99,999,999. */
export function isPackageAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= PARTNER_PACKAGE_AMOUNT_MAX_MINOR;
}

/**
 * Whether a value is an overage rate or a monthly overage cap a business can
 * have: a whole number of the currency's smallest unit, from 0 to
 * 99,999,999. A rate of 0 makes usage past the allowance cost nothing.
 */
export function isPackageOverageAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= PARTNER_PACKAGE_AMOUNT_MAX_MINOR;
}

/** Whether a value is a monthly allowance of minutes or chats: a whole number from 0 to 1,000,000. */
export function isPackageAllowance(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= PARTNER_PACKAGE_ALLOWANCE_MAX;
}

/**
 * Where a business's subscription to its package stands, as the console and
 * the business's billing page show it, from Stripe's subscription status.
 */
export type PackageSubscriptionStatus =
  /** Nobody paid the package's checkout yet, or the first payment hasn't gone through. */
  | "awaiting_payment"
  /** The subscription is paying. */
  | "active"
  /** A payment failed and Stripe is retrying it. The business keeps its allowance meanwhile. */
  | "past_due"
  /** The subscription ended, or Stripe stopped collecting it. The business has no allowance. */
  | "inactive";

export function packageSubscriptionStatus(state: string | null | undefined): PackageSubscriptionStatus {
  if (state === "active" || state === "trialing") return "active";
  if (state === "past_due") return "past_due";
  if (!state || state === "incomplete") return "awaiting_payment";
  return "inactive";
}
