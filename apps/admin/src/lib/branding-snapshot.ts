import { DEFAULT_APP_NAME, normalizeAppName, normalizeLogoUrl } from "@lobbystack/shared";

import { versionedAssetUrl } from "./versioned-assets";

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
};

export const DEFAULT_BRANDING_SNAPSHOT: BrandingSnapshot = { appName: DEFAULT_APP_NAME, logoUrl: null, final: true };

export const BRANDING_API_PATH = "/api/branding";

/**
 * The image the logo and the browser tab show: the deployment's own, the
 * LobbyStack mark while the name is still LobbyStack, or none, so a renamed
 * deployment never shows LobbyStack's mark beside its own name.
 */
export function brandLogoSrc(branding: Pick<BrandingSnapshot, "appName" | "logoUrl">): string | null {
  if (branding.logoUrl) return branding.logoUrl;
  return branding.appName === DEFAULT_APP_NAME ? versionedAssetUrl("/brand/logo-icon.svg") : null;
}

/** The name and logo in a GET /api/branding body, or null when the body is not one. */
export function parseBrandingResponse(value: unknown): Pick<BrandingSnapshot, "appName" | "logoUrl"> | null {
  if (!value || typeof value !== "object") return null;
  const { appName, logoUrl } = value as { appName?: unknown; logoUrl?: unknown };
  const name = normalizeAppName(appName);
  const logo = logoUrl === null ? null : normalizeLogoUrl(logoUrl);
  if (!name || (logoUrl !== null && !logo)) return null;
  return { appName: name, logoUrl: logo };
}
