import { LOBBYSTACK_SITE_URL, brandLinks } from "@lobbystack/shared";

/** The marketing site's origin for canonical URLs, sitemaps, and feeds. */
export function marketingSiteUrl(): string {
  return brandLinks().siteUrl.replace(/\/$/, "");
}

/**
 * Only the production site may be indexed. A staging or self-hosted build
 * serves the same pages under its own origin and keeps them out of search.
 */
export function isIndexableMarketingSite(): boolean {
  return marketingSiteUrl() === LOBBYSTACK_SITE_URL;
}
