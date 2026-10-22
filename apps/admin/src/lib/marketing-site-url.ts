import { LOBBYSTACK_SITE_URL, brandLinks, isInterfaceLocale } from "@lobbystack/shared";

import { translatedBasePaths } from "@/marketing/i18n/translated-base-paths";

import { DEFAULT_LOCALE, type SupportedLocale } from "./locale";

// The pages the marketing site has in every locale, from the site's own list.
const translatedPaths = new Set<string>(translatedBasePaths);

export type MarketingLocale = SupportedLocale;

function normalizedPath(path = "/"): string {
  const pathname = path.split("#")[0]?.split("?")[0] || "/";

  if (pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function stripLocaleFromPath(path = "/"): string {
  const normalized = normalizedPath(path);
  const [, maybeLocale, ...rest] = normalized.split("/");

  if (!isInterfaceLocale(maybeLocale) || maybeLocale === DEFAULT_LOCALE) {
    return normalized;
  }

  const stripped = `/${rest.join("/")}`;
  return normalizedPath(stripped === "/" ? "/" : stripped);
}

export function localizeMarketingPath(
  locale: MarketingLocale,
  path = "/",
): string {
  const basePath = stripLocaleFromPath(path);

  if (locale === DEFAULT_LOCALE) {
    return basePath;
  }
  if (!translatedPaths.has(basePath)) {
    return basePath;
  }
  if (basePath === "/") {
    return `/${locale}/`;
  }
  return `/${locale}${basePath}`;
}

export function localizeMarketingHref(
  locale: MarketingLocale,
  href: string,
): string {
  if (
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("/.well-known/") ||
    href.startsWith("/api/") ||
    href.startsWith("/openapi.json") ||
    href.startsWith("/schema/") ||
    href.startsWith("/schemamap.xml") ||
    href.startsWith("/feed.xml") ||
    href.startsWith("/llms.txt") ||
    href.endsWith(".md") ||
    href.endsWith(".txt")
  ) {
    return href;
  }

  const { siteUrl } = brandLinks();
  // Another site keeps the path as it is: only LobbyStack's has these pages
  // under /fr/, /es/ and /sr/. A site served under a path keeps that path.
  if (siteUrl !== LOBBYSTACK_SITE_URL) {
    return new URL(href.replace(/^\/+/, ""), `${siteUrl}/`).toString();
  }

  const suffixStart = href.search(/[?#]/);
  const pathname = suffixStart === -1 ? href : href.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : href.slice(suffixStart);
  const localizedPath = localizeMarketingPath(locale, pathname || "/");

  return new URL(`${localizedPath}${suffix}`, siteUrl).toString();
}

/** The terms of service: the deployment's own page, else /terms on its site. */
export function termsHref(locale: MarketingLocale): string {
  return brandLinks().termsUrl ?? localizeMarketingHref(locale, "/terms");
}

/** The privacy policy: the deployment's own page, else /privacy on its site. */
export function privacyHref(locale: MarketingLocale): string {
  return brandLinks().privacyUrl ?? localizeMarketingHref(locale, "/privacy");
}

/**
 * The affiliate program's terms. The deployment's own terms page opens at the
 * top, since only LobbyStack's is known to have an #affiliate-program section.
 */
export function affiliateTermsHref(locale: MarketingLocale): string {
  return brandLinks().termsUrl ?? localizeMarketingHref(locale, "/terms/#affiliate-program");
}
