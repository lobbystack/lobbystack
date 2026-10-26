// What the partner program has turned on in this deployment. The admin and
// the worker both ask here, so they never disagree, and nothing else reads
// the partner environment variables. Each feature turns on only when its
// configuration exists.

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
  /** Every POLAR_PARTNER_<TIER>_<INTERVAL>_PRODUCT_ID is set. */
  tierBilling: boolean;
  /** What issues certificates for partners' own domains, or null when partners can't add one. */
  customDomains: "cloudflare" | "caddy" | null;
};

const PAID_PARTNER_TIERS = ["STARTER", "GROWTH", "SCALE"] as const;
const BILLING_INTERVALS = ["MONTHLY", "ANNUAL"] as const;

function isSet(value: string | undefined): boolean {
  return Boolean(value?.trim());
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
  // The cloud stays on invitations until it bills tiers; elsewhere anyone can sign up.
  return env.DEPLOYMENT_MODE?.trim() === "cloud" ? "invite" : "open";
}

export function partnerFeatures(env: Record<string, string | undefined>): PartnerFeatures {
  return {
    enabled: true,
    signup: partnerSignup(env),
    baseDomain: partnerBaseDomain(env.PARTNER_BASE_DOMAIN),
    stripeConnect: isSet(env.STRIPE_CONNECT_SECRET_KEY) && isSet(env.STRIPE_CONNECT_WEBHOOK_SECRET),
    tierBilling: PAID_PARTNER_TIERS.every((tier) => BILLING_INTERVALS.every((interval) => isSet(env[`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`]))),
    // Caddy's on-demand TLS has no setting of its own yet, so this never answers caddy.
    customDomains: isSet(env.CLOUDFLARE_SAAS_API_TOKEN) && isSet(env.CLOUDFLARE_SAAS_ZONE_ID) ? "cloudflare" : null,
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
  return warnings;
}
