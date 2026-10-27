// The brand a page, a route or an email shows: the host brand, built from
// deployment branding, or a partner's brand, built from what the partner saved
// on the console's Branding & domain page. packages/domain resolves which
// brand applies (brands.ts).

import { brandLinks, contactEmailFor, type BrandLinks } from "./brandLinks";
import { BRAND_LOGO_PATH, readBrandingEnvironment, resolveBranding, type SavedBranding } from "./branding";
import { partnerSubdomainLabel } from "./hosts";
import { partnerFeatures } from "./partnerFeatures";

export type Brand = {
  kind: "host" | "partner";
  partnerId: string | null;
  name: string;
  /** The logo's URL, which may be a path on the brand's origin, or null for none of its own. */
  logoUrl: string | null;
  /** The logo emails show, when it differs from logoUrl: null for an SVG logo, which Gmail and Outlook don't show. */
  emailLogoUrl?: string | null;
  faviconUrl: string | null;
  color: string | null;
  /** Where the brand's dashboard lives, without a trailing slash. */
  origin: string;
  links: { website: string | null; terms: string | null; privacy: string | null; support: string | null };
  email: { fromName: string; fromAddress: string; replyTo: string | null };
};

/** The parts of a brand an email's text, layout and links use. */
export type EmailBrand = Pick<Brand, "kind" | "name" | "logoUrl" | "emailLogoUrl" | "origin">;

/**
 * Which brand a queued email goes out under. The payload carries this
 * reference rather than the brand itself, and the worker resolves it when it
 * sends, so a brand change reaches emails still in the queue.
 */
export type EmailBrandReference = { kind: "host" } | { kind: "partner"; partnerId: string } | { kind: "business"; businessId: string };

/** The host's own emails, such as dashboard feedback and the founder check-in. */
export const HOST_EMAIL_BRAND = { kind: "host" } as const satisfies EmailBrandReference;

/** The reference for an email sent while answering a request under this brand, such as a sign-up code. */
export function emailBrandReferenceFor(brand: Pick<Brand, "kind" | "partnerId">): EmailBrandReference {
  return brand.kind === "partner" && brand.partnerId ? { kind: "partner", partnerId: brand.partnerId } : HOST_EMAIL_BRAND;
}

/**
 * The reference in a queued email's payload. A payload queued before payloads
 * carried one has none and goes out under the host brand. Any other value the
 * worker can't read throws, so the email waits rather than going out under the
 * wrong brand.
 */
export function parseEmailBrandReference(value: unknown): EmailBrandReference {
  if (value === undefined) return HOST_EMAIL_BRAND;
  if (value && typeof value === "object") {
    const { kind, partnerId, businessId } = value as { kind?: unknown; partnerId?: unknown; businessId?: unknown };
    if (kind === "host") return HOST_EMAIL_BRAND;
    if (kind === "partner" && typeof partnerId === "string" && partnerId) return { kind, partnerId };
    if (kind === "business" && typeof businessId === "string" && businessId) return { kind, businessId };
  }
  throw new Error(`Unknown email brand: ${JSON.stringify(value)}.`);
}

/**
 * The sender and Reply-To an email goes out with under this brand. The host
 * sends from EMAIL_FROM exactly as written, which the email provider holds, so
 * no sender is returned for it; any other brand sends as itself. A payload's
 * Reply-To of null means the brand's own, except on an email with a sender of
 * its own, such as the founder check-in, which takes replies at that sender.
 */
export function emailSender(brand: Pick<Brand, "kind" | "email">, message: { from?: string | null; replyTo?: string | null }): { from?: string; replyTo?: string } {
  const from = message.from || (brand.kind === "host" ? undefined : formatEmailSender(brand.email.fromName, brand.email.fromAddress));
  const replyTo = message.replyTo || (message.from ? undefined : brand.email.replyTo ?? undefined);
  return { ...(from ? { from } : {}), ...(replyTo ? { replyTo } : {}) };
}

function formatEmailSender(name: string, address: string): string {
  return name ? `"${name.replace(/["\\]/g, "\\$&")}" <${address}>` : address;
}

/** The sender the worker uses when EMAIL_FROM is unset. */
export const DEFAULT_EMAIL_FROM = "LobbyStack <no-reply@localhost>";

/** Where links point when APP_BASE_URL is unset, as auth and the worker already assume. */
const DEFAULT_ORIGIN = "http://localhost:3000";

/** The display name and address of a sender such as `LobbyStack <no-reply@example.com>`, or of a bare address. */
export function parseEmailSender(value: string): { name: string; address: string } {
  // Split on the angle brackets instead of one regex, which backtracks on long runs of spaces.
  const trimmed = value.trim();
  const open = trimmed.lastIndexOf("<");
  if (open === -1 || !trimmed.endsWith(">")) return { name: "", address: trimmed };
  const address = trimmed.slice(open + 1, -1);
  if (!address || /[<>\s]/.test(address)) return { name: "", address: trimmed };
  const name = trimmed.slice(0, open).trim();
  if (name.includes("<")) return { name: "", address: trimmed };
  return { name: name.replace(/^"/, "").replace(/"$/, "").trim(), address };
}

/**
 * The host brand: the name and logo from deployment branding (the
 * environment, then the saved choice, then LobbyStack), the links from the
 * NEXT_PUBLIC_ link variables, the origin from APP_BASE_URL, and the sender
 * from EMAIL_FROM and EMAIL_REPLY_TO.
 */
export function hostBrand(input: { environment: Record<string, string | undefined>; saved: SavedBranding | null; links?: BrandLinks }): Brand {
  const { environment } = input;
  const branding = resolveBranding({ environment: readBrandingEnvironment(environment), saved: input.saved });
  const links = input.links ?? brandLinks();
  const sender = parseEmailSender(environment.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM);
  return {
    kind: "host",
    partnerId: null,
    name: branding.appName,
    logoUrl: branding.logoUrl,
    // Deployment branding has one image, so the tab shows the logo.
    faviconUrl: branding.logoUrl,
    color: null,
    origin: (environment.APP_BASE_URL?.trim() || DEFAULT_ORIGIN).replace(/\/$/, ""),
    links: {
      website: links.siteUrl,
      terms: links.termsUrl ?? `${links.siteUrl}/terms`,
      privacy: links.privacyUrl ?? `${links.siteUrl}/privacy`,
      support: `mailto:${contactEmailFor(links, "support")}`,
    },
    email: { fromName: sender.name || branding.appName, fromAddress: sender.address, replyTo: environment.EMAIL_REPLY_TO?.trim() || null },
  };
}

/** A partner's brand as the database keeps it (app.partner_brand). */
export type PartnerBrandRecord = {
  partnerId: string;
  name: string;
  /** The hostname of its verified subdomain, such as acme.receptionistportal.com, or null for none. */
  subdomain: string | null;
  /** The hostname of its own domain once verified, such as app.acmeagency.com, or null for none. */
  customDomain?: string | null;
  /** A digest of each saved image, so its URL changes whenever the image does, or null for none saved. */
  logoVersion: string | null;
  /** The saved logo's media type, such as image/svg+xml, when known. */
  logoContentType?: string | null;
  faviconVersion: string | null;
  color: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  supportUrl: string | null;
  /** Where replies to its emails go, and its support link when it has no support page. */
  supportEmail: string | null;
};

export type BrandImage = "logo" | "favicon";

/**
 * The URL of a partner's saved logo or favicon. It names the partner, so it
 * shows the same image on the host's domain, in the console, as on the
 * partner's own, and it carries the image's digest, so browsers may cache it
 * for good.
 */
export function partnerBrandImageUrl(partnerId: string, image: BrandImage, version: string): string {
  const query = new URLSearchParams({ partner: partnerId, ...(image === "favicon" ? { image } : {}), v: version });
  return `${BRAND_LOGO_PATH}?${query.toString()}`;
}

function appOrigin(environment: Record<string, string | undefined>): URL {
  try {
    return new URL(environment.APP_BASE_URL?.trim() || DEFAULT_ORIGIN);
  } catch {
    return new URL(DEFAULT_ORIGIN);
  }
}

/**
 * The partner's subdomain when it's still directly under the partner base
 * domain, or null. A subdomain left from an earlier base domain doesn't count.
 */
export function currentPartnerSubdomain(subdomain: string | null, environment: Record<string, string | undefined>): string | null {
  const { baseDomain } = partnerFeatures(environment);
  return subdomain && baseDomain && partnerSubdomainLabel(subdomain, baseDomain) ? subdomain : null;
}

/**
 * Where a partner's dashboard lives: its subdomain, with the scheme and port
 * of APP_BASE_URL, so http://acme.partners.localhost:13000 in development and
 * https://acme.receptionistportal.com on the cloud. A partner with no current
 * subdomain has only the host's origin.
 */
export function partnerOrigin(subdomain: string | null, environment: Record<string, string | undefined>): string {
  const app = appOrigin(environment);
  const current = currentPartnerSubdomain(subdomain, environment);
  return current ? `${app.protocol}//${current}${app.port ? `:${app.port}` : ""}` : app.origin;
}

/**
 * Where a partner's own domain serves its dashboard, with the scheme and port
 * of APP_BASE_URL, since TLS ends before the admin there too.
 */
export function customDomainOrigin(hostname: string, environment: Record<string, string | undefined>): string {
  const app = appOrigin(environment);
  return `${app.protocol}//${hostname}${app.port ? `:${app.port}` : ""}`;
}

/**
 * Where a partner's brand sends people: its subdomain, as partnerOrigin builds
 * it, which every partner gets and which sign-up works on everywhere. A partner
 * with no current subdomain, as on a deployment without a partner base domain,
 * uses its own domain once verified, while the deployment still serves
 * partners' own domains. A partner with neither has the host's origin.
 */
export function partnerBrandOrigin(partner: Pick<PartnerBrandRecord, "subdomain" | "customDomain">, environment: Record<string, string | undefined>): string {
  if (currentPartnerSubdomain(partner.subdomain, environment) || !partner.customDomain || !partnerFeatures(environment).customDomains) return partnerOrigin(partner.subdomain, environment);
  return customDomainOrigin(partner.customDomain, environment);
}

/**
 * A partner's brand: its name, images, color and links, its origin on its
 * subdomain or its own domain, and emails from no-reply@ the partner base domain (or the host's
 * address without one) under its name, with its support email as Reply-To.
 * What the partner leaves unset stays empty: a partner's pages never show the
 * host's logo or links in its place.
 */
export function partnerBrand(input: { environment: Record<string, string | undefined>; partner: PartnerBrandRecord }): Brand {
  const { environment, partner } = input;
  const { baseDomain } = partnerFeatures(environment);
  const logoUrl = partner.logoVersion ? partnerBrandImageUrl(partner.partnerId, "logo", partner.logoVersion) : null;
  const sender = parseEmailSender(environment.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM);
  return {
    kind: "partner",
    partnerId: partner.partnerId,
    name: partner.name,
    logoUrl,
    ...(partner.logoContentType === "image/svg+xml" ? { emailLogoUrl: null } : {}),
    faviconUrl: partner.faviconVersion ? partnerBrandImageUrl(partner.partnerId, "favicon", partner.faviconVersion) : logoUrl,
    color: partner.color,
    origin: partnerBrandOrigin(partner, environment),
    links: {
      website: null,
      terms: partner.termsUrl,
      privacy: partner.privacyUrl,
      support: partner.supportUrl ?? (partner.supportEmail ? `mailto:${partner.supportEmail}` : null),
    },
    email: { fromName: partner.name, fromAddress: baseDomain ? `no-reply@${baseDomain}` : sender.address, replyTo: partner.supportEmail },
  };
}
