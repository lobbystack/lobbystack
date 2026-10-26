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

// Control, format and line separator characters, bidirectional overrides among
// them, would let a name rearrange or hide the text around it in titles and emails.
const UNSAFE_NAME_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** A partner's name as its brand shows it: 1 to 80 visible characters, whitespace collapsed, or null when the value can't be one. */
export function normalizePartnerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").replace(/\s+/g, " ").trim();
  return name && name.length <= PARTNER_NAME_MAX_LENGTH && !UNSAFE_NAME_CHARACTERS.test(name) ? name : null;
}

/** The longest terms, privacy or support link a partner's brand keeps. */
export const PARTNER_LINK_MAX_LENGTH = 2048;

/** A brand color as #rrggbb in lowercase, from #rgb or #rrggbb in either case, or null when the value is neither. */
export function normalizeBrandColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  return /^#[0-9a-f]{3}$/.test(color) ? `#${[...color.slice(1)].map((digit) => digit + digit).join("")}` : null;
}

/**
 * What a partner's business lets its own operators do. Full access is today's
 * owner and admin work, minus billing, API keys and MCP. Activity only shows
 * calls, chats, appointments, contacts and messages.
 */
export type PartnerAccessLevel = "full" | "activity";

export const partnerAccessLevels = ["full", "activity"] as const satisfies ReadonlyArray<PartnerAccessLevel>;

export function isPartnerAccessLevel(value: unknown): value is PartnerAccessLevel {
  return typeof value === "string" && (partnerAccessLevels as readonly string[]).includes(value);
}
