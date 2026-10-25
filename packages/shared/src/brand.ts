// The brand a page, a route or an email shows. Today every one shows the
// host brand, built from deployment branding; partners bring brands of their
// own later. packages/domain resolves which brand applies (brands.ts).

import { brandLinks, contactEmailFor, type BrandLinks } from "./brandLinks";
import { readBrandingEnvironment, resolveBranding, type SavedBranding } from "./branding";

export type Brand = {
  kind: "host" | "partner";
  partnerId: string | null;
  name: string;
  /** The logo's URL, which may be a path on the brand's origin, or null for none of its own. */
  logoUrl: string | null;
  faviconUrl: string | null;
  color: string | null;
  /** Where the brand's dashboard lives, without a trailing slash. */
  origin: string;
  links: { website: string | null; terms: string | null; privacy: string | null; support: string | null };
  email: { fromName: string; fromAddress: string; replyTo: string | null };
};

/** The parts of a brand an email's text, layout and links use. */
export type EmailBrand = Pick<Brand, "kind" | "name" | "logoUrl" | "origin">;

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
  const match = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+)>\s*$/.exec(value);
  return match ? { name: match[1]!.trim(), address: match[2]! } : { name: "", address: value.trim() };
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
