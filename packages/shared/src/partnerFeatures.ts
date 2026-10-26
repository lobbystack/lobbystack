// What the partner program has turned on in this deployment. The admin and
// the worker both ask here, so they never disagree, and nothing else reads
// the partner environment variables. Each feature turns on only when its
// configuration exists.

import { billingIntervals, paidPartnerTierSlugs, type BillingInterval, type PaidPartnerTierSlug } from "./billing";

export type PartnerSignup = "open" | "invite";

export type PartnerFeatures = {
  /** Partners work on every deployment, whatever else is configured. */
  enabled: boolean;
  /** Whether anyone signed in can sign up as a partner, or only someone the host invited. */
  signup: PartnerSignup;
  /** PARTNER_BASE_DOMAIN: each partner gets a subdomain of it, and partner emails go out from it. */
  baseDomain: string | null;
  /** The Stripe Connect key and webhook secret are both set. */
  stripeConnect: boolean;
  /**
   * Every POLAR_PARTNER_<TIER>_<INTERVAL>_PRODUCT_ID is set, each to its own
   * product, so partners buy tiers through Polar. Without it partners have no
   * tier billing, and nothing limits their pools or phone numbers.
   */
  tierBilling: boolean;
  /**
   * What issues certificates for partners' own domains: Cloudflare for SaaS
   * on the cloud, or the host's Caddy with on-demand TLS. Null when partners
   * can't add one.
   */
  customDomains: "cloudflare" | "caddy" | null;
  /**
   * An abuse guard, not a feature: the most calls a partner's businesses
   * hold open at once. A call past it is refused as a pool out of minutes
   * is, so it forwards the same way. PARTNER_MAX_SIMULTANEOUS_CALLS, a whole
   * number above 0, overrides PARTNER_MAX_SIMULTANEOUS_CALLS_DEFAULT. Code
   * only: no docs, dashboard, email or error text names it.
   */
  maxSimultaneousCalls: number;
};

export const PARTNER_MAX_SIMULTANEOUS_CALLS_DEFAULT = 30;

function maxSimultaneousCalls(env: Record<string, string | undefined>): number {
  const value = Number(env.PARTNER_MAX_SIMULTANEOUS_CALLS?.trim() || Number.NaN);
  return Number.isSafeInteger(value) && value > 0 ? value : PARTNER_MAX_SIMULTANEOUS_CALLS_DEFAULT;
}

function isSet(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/** A partner tier's Polar product for one billing interval. */
export type PartnerTierProduct = { tier: PaidPartnerTierSlug; billingInterval: BillingInterval; productId: string };

/** The Polar products the host sells tiers with, from every POLAR_PARTNER_<TIER>_<INTERVAL>_PRODUCT_ID that's set. */
export function partnerTierProducts(env: Record<string, string | undefined>): PartnerTierProduct[] {
  return paidPartnerTierSlugs.flatMap((tier) => billingIntervals.flatMap((billingInterval) => {
    const productId = env[`POLAR_PARTNER_${tier.toUpperCase()}_${billingInterval.toUpperCase()}_PRODUCT_ID`]?.trim();
    return productId ? [{ tier, billingInterval, productId }] : [];
  }));
}

/** The Polar product that sells a tier for a billing interval, or null when it isn't set. */
export function partnerTierProductId(env: Record<string, string | undefined>, tier: PaidPartnerTierSlug, billingInterval: BillingInterval): string | null {
  return partnerTierProducts(env).find((product) => product.tier === tier && product.billingInterval === billingInterval)?.productId ?? null;
}

/** The tier and interval a Polar product sells, or null for a product that sells no tier. */
export function partnerTierForProduct(env: Record<string, string | undefined>, productId: string | null | undefined): Omit<PartnerTierProduct, "productId"> | null {
  const product = productId ? partnerTierProducts(env).find((candidate) => candidate.productId === productId) : undefined;
  return product ? { tier: product.tier, billingInterval: product.billingInterval } : null;
}

// A hostname of letters, digits and hyphens, such as receptionistportal.com
// or partners.localhost. A scheme, a path, a port or a wildcard isn't one.
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** The partner base domain a PARTNER_BASE_DOMAIN value names, lowercased and without a trailing dot, or null when it names none. */
function partnerBaseDomain(value: string | undefined): string | null {
  const domain = value?.trim().toLowerCase().replace(/\.$/, "");
  return domain && HOSTNAME.test(domain) ? domain : null;
}

function partnerSignup(env: Record<string, string | undefined>): PartnerSignup {
  const setting = env.PARTNER_SIGNUP?.trim().toLowerCase();
  if (setting === "open" || setting === "invite") return setting;
  // The cloud stays on invitations until it bills tiers, so no partner signs
  // up before it can pay for its pool. Elsewhere anyone can sign up.
  return env.DEPLOYMENT_MODE?.trim() === "cloud" && !hasEveryTierProduct(env) ? "invite" : "open";
}

/** Every tier has a Polar product for each interval, and no two share one, so each subscription names one tier. */
function hasEveryTierProduct(env: Record<string, string | undefined>): boolean {
  const products = partnerTierProducts(env);
  return products.length === paidPartnerTierSlugs.length * billingIntervals.length && new Set(products.map((product) => product.productId)).size === products.length;
}

function hasCloudflareForSaas(env: Record<string, string | undefined>): boolean {
  return isSet(env.CLOUDFLARE_SAAS_API_TOKEN) && isSet(env.CLOUDFLARE_SAAS_ZONE_ID);
}

/** CADDY_ON_DEMAND_TLS as a switch: true or false, or null for a value that's neither. Unset is false. */
function caddyOnDemandTls(env: Record<string, string | undefined>): boolean | null {
  const value = env.CADDY_ON_DEMAND_TLS?.trim().toLowerCase();
  if (!value || value === "false") return false;
  return value === "true" ? true : null;
}

/**
 * What issues partners' certificates: Cloudflare for SaaS when its token and
 * zone are set, which wins over Caddy, and otherwise Caddy's on-demand TLS
 * when CADDY_ON_DEMAND_TLS says the host's Caddy asks the admin first.
 */
function customDomainIssuer(env: Record<string, string | undefined>): PartnerFeatures["customDomains"] {
  if (hasCloudflareForSaas(env)) return "cloudflare";
  return caddyOnDemandTls(env) ? "caddy" : null;
}

export function partnerFeatures(env: Record<string, string | undefined>): PartnerFeatures {
  return {
    enabled: true,
    signup: partnerSignup(env),
    baseDomain: partnerBaseDomain(env.PARTNER_BASE_DOMAIN),
    stripeConnect: isSet(env.STRIPE_CONNECT_SECRET_KEY) && isSet(env.STRIPE_CONNECT_WEBHOOK_SECRET),
    tierBilling: hasEveryTierProduct(env),
    customDomains: customDomainIssuer(env),
    maxSimultaneousCalls: maxSimultaneousCalls(env),
  };
}

/**
 * The partner settings that are set but that partnerFeatures ignores, as
 * messages the admin and the worker log when they start. An ignored partner
 * base domain matters most: while it lasts, signup reserves no subdomain and
 * partner emails go out from EMAIL_FROM.
 */
export function partnerFeatureWarnings(env: Record<string, string | undefined>): string[] {
  const warnings: string[] = [];
  const domain = env.PARTNER_BASE_DOMAIN?.trim();
  if (domain && !partnerBaseDomain(domain)) {
    warnings.push(`PARTNER_BASE_DOMAIN is ignored: "${domain}" isn't a bare hostname such as receptionistportal.com. New partners get no subdomain, and partner emails go out from EMAIL_FROM, until it's fixed.`);
  }
  const signup = env.PARTNER_SIGNUP?.trim().toLowerCase();
  if (signup && signup !== "open" && signup !== "invite") {
    warnings.push(`PARTNER_SIGNUP is ignored: it takes open or invite, so signup stays ${partnerSignup(env)}.`);
  }
  if (isSet(env.CLOUDFLARE_SAAS_API_TOKEN) !== isSet(env.CLOUDFLARE_SAAS_ZONE_ID)) {
    warnings.push(`Cloudflare for SaaS is off: ${isSet(env.CLOUDFLARE_SAAS_API_TOKEN) ? "CLOUDFLARE_SAAS_ZONE_ID" : "CLOUDFLARE_SAAS_API_TOKEN"} isn't set. Partners can't add their own domains through Cloudflare until both are.`);
  }
  const caddy = caddyOnDemandTls(env);
  if (caddy === null) {
    warnings.push(`CADDY_ON_DEMAND_TLS is ignored: it takes true or false, so partners ${customDomainIssuer(env) ? "add their own domains through Cloudflare for SaaS" : "can't add their own domains"}.`);
  } else if (caddy && hasCloudflareForSaas(env)) {
    warnings.push("CADDY_ON_DEMAND_TLS is ignored: Cloudflare for SaaS is set up too, and it issues partners' certificates instead.");
  }
  const products = partnerTierProducts(env);
  if (products.length > 0 && !hasEveryTierProduct(env)) {
    const missing = paidPartnerTierSlugs.flatMap((tier) => billingIntervals.filter((interval) => !products.some((product) => product.tier === tier && product.billingInterval === interval)).map((interval) => `POLAR_PARTNER_${tier.toUpperCase()}_${interval.toUpperCase()}_PRODUCT_ID`));
    warnings.push(missing.length > 0
      ? `Partner tier billing is off: ${missing.join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} set. Partners can't buy a tier, and nothing limits their pools or phone numbers, until every tier has a monthly and an annual product.`
      : "Partner tier billing is off: two POLAR_PARTNER_*_PRODUCT_ID settings name the same product. Give each tier and interval its own product.");
  }
  return warnings;
}
