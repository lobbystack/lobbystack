// Where the app sends people outside itself: the deployment's website, its
// terms and privacy policy, its docs, and the address people write to.
//
// Each one comes from a NEXT_PUBLIC_ variable, which Next.js writes into the
// admin's build, so a change takes a rebuild. Whatever a deployment leaves
// unset, or sets to something unusable, links to LobbyStack's own.

/** The variables that point the app's outside links at a deployment's own pages and inbox. */
export const BRAND_LINK_ENVIRONMENT = {
  siteUrl: "NEXT_PUBLIC_LANDING_SITE_URL",
  termsUrl: "NEXT_PUBLIC_TERMS_URL",
  privacyUrl: "NEXT_PUBLIC_PRIVACY_URL",
  docsUrl: "NEXT_PUBLIC_DOCS_SITE_URL",
  contactEmail: "NEXT_PUBLIC_CONTACT_EMAIL",
} as const;

export type BrandLinkVariable = (typeof BRAND_LINK_ENVIRONMENT)[keyof typeof BRAND_LINK_ENVIRONMENT];

export type BrandLinkEnvironment = Partial<Record<BrandLinkVariable, string | undefined>>;

export const LOBBYSTACK_SITE_URL = "https://lobbystack.com";
export const LOBBYSTACK_DOCS_URL = "https://docs.lobbystack.com";

/** LobbyStack's address for each place the app gives one. NEXT_PUBLIC_CONTACT_EMAIL replaces all three. */
export const LOBBYSTACK_CONTACT_EMAILS = {
  /** The dashboard's feedback form. */
  support: "support@lobbystack.com",
  /** The Enterprise plan's contact button. */
  sales: "hello@lobbystack.ai",
  /** The SMS HELP replies, worded as LobbyStack registered them with carriers. */
  sms: "hello@lobbystack.com",
} as const;

export type ContactPurpose = keyof typeof LOBBYSTACK_CONTACT_EMAILS;

export type BrandLinks = {
  /** The website, without a trailing slash. */
  siteUrl: string;
  /** The terms of service, or null for the website's /terms page. */
  termsUrl: string | null;
  /** The privacy policy, or null for the website's /privacy page. */
  privacyUrl: string | null;
  /** The docs, without a trailing slash. */
  docsUrl: string;
  /** The one address for everything, or null for LobbyStack's address for each purpose. */
  contactEmail: string | null;
};

function httpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

/** A site that links append paths to: an http or https URL with no query or fragment, without its trailing slash. */
export function normalizeSiteUrl(value: unknown): string | null {
  const url = httpUrl(value);
  return url && !url.search && !url.hash ? url.toString().replace(/\/+$/, "") : null;
}

/** One page's address: an http or https URL without credentials. */
export function normalizePageUrl(value: unknown): string | null {
  return httpUrl(value)?.toString() ?? null;
}

// Plain addresses only: anything else could end a mailto: link early or read
// oddly inside a text message.
const EMAIL_ADDRESS = /^[A-Za-z0-9._+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function normalizeEmailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();
  return address.length <= 254 && EMAIL_ADDRESS.test(address) ? address : null;
}

const normalizers: Record<BrandLinkVariable, (value: unknown) => string | null> = {
  NEXT_PUBLIC_LANDING_SITE_URL: normalizeSiteUrl,
  NEXT_PUBLIC_TERMS_URL: normalizePageUrl,
  NEXT_PUBLIC_PRIVACY_URL: normalizePageUrl,
  NEXT_PUBLIC_DOCS_SITE_URL: normalizeSiteUrl,
  NEXT_PUBLIC_CONTACT_EMAIL: normalizeEmailAddress,
};

/** Each link from the environment, else LobbyStack's. */
export function resolveBrandLinks(environment: BrandLinkEnvironment): BrandLinks {
  return {
    siteUrl: normalizeSiteUrl(environment.NEXT_PUBLIC_LANDING_SITE_URL) ?? LOBBYSTACK_SITE_URL,
    termsUrl: normalizePageUrl(environment.NEXT_PUBLIC_TERMS_URL),
    privacyUrl: normalizePageUrl(environment.NEXT_PUBLIC_PRIVACY_URL),
    docsUrl: normalizeSiteUrl(environment.NEXT_PUBLIC_DOCS_SITE_URL) ?? LOBBYSTACK_DOCS_URL,
    contactEmail: normalizeEmailAddress(environment.NEXT_PUBLIC_CONTACT_EMAIL),
  };
}

/** The variables that are set but hold nothing usable, so LobbyStack's link stands in for them. */
export function invalidBrandLinkVariables(environment: BrandLinkEnvironment): BrandLinkVariable[] {
  return (Object.keys(normalizers) as BrandLinkVariable[]).filter((name) => Boolean(environment[name]?.trim()) && normalizers[name](environment[name]) === null);
}

/**
 * The link variables as this process sees them. Next.js writes a NEXT_PUBLIC_
 * value into the build only where the code names it, so each one is named
 * here rather than read from an environment passed in.
 */
export function brandLinkEnvironment(): BrandLinkEnvironment {
  return {
    NEXT_PUBLIC_LANDING_SITE_URL: process.env.NEXT_PUBLIC_LANDING_SITE_URL,
    NEXT_PUBLIC_TERMS_URL: process.env.NEXT_PUBLIC_TERMS_URL,
    NEXT_PUBLIC_PRIVACY_URL: process.env.NEXT_PUBLIC_PRIVACY_URL,
    NEXT_PUBLIC_DOCS_SITE_URL: process.env.NEXT_PUBLIC_DOCS_SITE_URL,
    NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  };
}

/** Where this deployment's outside links go. */
export function brandLinks(): BrandLinks {
  return resolveBrandLinks(brandLinkEnvironment());
}

/** The address to give for one purpose: the deployment's own, else LobbyStack's for that purpose. */
export function contactEmailFor(links: Pick<BrandLinks, "contactEmail">, purpose: ContactPurpose): string {
  return links.contactEmail ?? LOBBYSTACK_CONTACT_EMAILS[purpose];
}
