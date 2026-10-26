import { DEFAULT_APP_NAME, normalizeLogoUrl, normalizePartnerName } from "@lobbystack/shared";

import { versionedAssetUrl } from "./versioned-assets";

/** What a partner's pages show in place of the host's: its tab icon, its color, and its own links. */
export type PartnerBranding = {
  faviconUrl: string | null;
  /** The partner's color as #rrggbb, or null to keep the dashboard's own. */
  color: string | null;
  /** Each link the partner set, or null for one it left out, which its pages then leave out too. */
  links: { terms: string | null; privacy: string | null; support: string | null };
};

/** The name and logo a page renders with. */
export type BrandingSnapshot = {
  appName: string;
  /** The logo's URL, or null when the deployment has none of its own. */
  logoUrl: string | null;
  /**
   * False on a prerendered page built before the database could say: the
   * browser then asks /api/branding for the name and logo.
   */
  final: boolean;
  /** Set only on a partner's pages. The host's icon is its logo and its links come from the build. */
  partner?: PartnerBranding;
};

export const DEFAULT_BRANDING_SNAPSHOT: BrandingSnapshot = { appName: DEFAULT_APP_NAME, logoUrl: null, final: true };

export const BRANDING_API_PATH = "/api/branding";

/**
 * The image the logo and the browser tab show: the deployment's own, the
 * LobbyStack mark while the name is still LobbyStack, or none, so a renamed
 * deployment never shows LobbyStack's mark beside its own name.
 */
export function brandLogoSrc(branding: { appName: string; logoUrl: string | null; partner?: PartnerBranding | boolean | null | undefined }): string | null {
  if (branding.logoUrl) return branding.logoUrl;
  return branding.appName === DEFAULT_APP_NAME && !branding.partner ? versionedAssetUrl("/brand/logo-icon.svg") : null;
}

/** The tab's icon: a partner's favicon, else the image the logo shows. */
export function brandIconSrc(branding: Pick<BrandingSnapshot, "appName" | "logoUrl" | "partner">): string | null {
  return branding.partner ? branding.partner.faviconUrl ?? branding.logoUrl : brandLogoSrc(branding);
}

/**
 * The name and logo in a GET /api/branding body, or null when the body is not
 * one. A partner's name may run to 80 characters, twice the host's.
 */
export function parseBrandingResponse(value: unknown): Pick<BrandingSnapshot, "appName" | "logoUrl"> | null {
  if (!value || typeof value !== "object") return null;
  const { appName, logoUrl } = value as { appName?: unknown; logoUrl?: unknown };
  const name = normalizePartnerName(appName);
  const logo = logoUrl === null ? null : normalizeLogoUrl(logoUrl);
  if (!name || (logoUrl !== null && !logo)) return null;
  return { appName: name, logoUrl: logo };
}
