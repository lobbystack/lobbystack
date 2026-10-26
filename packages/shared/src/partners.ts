// A partner's team and its handle. The handle (its slug) is also the label of
// its subdomain under the partner base domain, so it follows DNS rules.

export type PartnerRole = "owner" | "admin" | "member";

export const partnerRoles = ["owner", "admin", "member"] as const satisfies ReadonlyArray<PartnerRole>;

export function isPartnerRole(value: unknown): value is PartnerRole {
  return typeof value === "string" && (partnerRoles as readonly string[]).includes(value);
}

export const PARTNER_NAME_MAX_LENGTH = 80;
export const PARTNER_SLUG_MIN_LENGTH = 3;
export const PARTNER_SLUG_MAX_LENGTH = 40;

// Labels a host keeps for its own services, or that would pass for one.
const RESERVED_PARTNER_SLUGS = new Set([
  "admin", "api", "app", "assets", "auth", "billing", "blog", "cdn", "console", "dashboard", "demo", "dev", "dns", "docs",
  "email", "embed", "ftp", "help", "host", "imap", "localhost", "login", "mail", "mcp", "mx", "ns1", "ns2", "oauth",
  "partner", "partners", "pop", "portal", "preview", "signin", "signup", "smtp", "staging", "static", "status",
  "support", "test", "webhooks", "widget", "www",
]);

const PARTNER_SLUG = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/**
 * Whether a value can be a partner's slug: 3 to 40 lowercase letters, digits
 * and hyphens, starting and ending with a letter or digit, and not a label
 * the host keeps. Labels starting with xn-- are punycode, which could spell a
 * lookalike of another name.
 */
export function isPartnerSlug(value: string): boolean {
  return value.length >= PARTNER_SLUG_MIN_LENGTH
    && value.length <= PARTNER_SLUG_MAX_LENGTH
    && PARTNER_SLUG.test(value)
    && !value.startsWith("xn--")
    && !RESERVED_PARTNER_SLUGS.has(value);
}

/** A slug made from a partner's name, such as bright-desk for "Bright Desk!", or "" when the name has no letters or digits to use. */
export function partnerSlugFromName(name: string): string {
  const slug = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, PARTNER_SLUG_MAX_LENGTH).replace(/-+$/, "");
  return isPartnerSlug(slug) ? slug : "";
}
