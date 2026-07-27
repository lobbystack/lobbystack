const LANDING_SITE_URL =
  import.meta.env.VITE_LANDING_SITE_URL?.replace(/\/$/, "") ??
  "https://lobbystack.com";

const DEFAULT_LOCALE = "en";

const translatedBasePaths = new Set([
  "/",
  "/features/",
  "/pricing/",
  "/solutions/",
  "/solutions/ai-phone-answering/",
  "/solutions/ai-appointment-scheduler/",
  "/solutions/ai-receptionist-for-home-services/",
  "/missed-call-revenue-calculator/",
  "/comparison/",
  "/blog/",
  "/changelog/",
  "/blog/lobbystack-is-live/",
  "/blog/ai-receptionist-savings/",
  "/blog/how-to-choose-an-ai-receptionist/",
  "/blog/build-or-buy-ai-receptionist/",
  "/blog/open-source-ai-receptionist-stack/",
  "/blog/best-open-source-ai-phone-answering-services/",
  "/blog/ai-receptionist-workflows/",
  "/blog/ai-receptionist-affiliate-program/",
  "/affiliate-program/",
  "/docs/api/",
  "/privacy/",
  "/cookie-policy/",
  "/terms/",
  "/search/",
]);

export type MarketingLocale = "en" | "fr";

function normalizedPath(path = "/"): string {
  const pathname = path.split("#")[0]?.split("?")[0] || "/";

  if (pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function isLocale(value: string | undefined): value is MarketingLocale {
  return value === "en" || value === "fr";
}

function stripLocaleFromPath(path = "/"): string {
  const normalized = normalizedPath(path);
  const [, maybeLocale, ...rest] = normalized.split("/");

  if (!isLocale(maybeLocale) || maybeLocale === DEFAULT_LOCALE) {
    return normalized;
  }

  const stripped = `/${rest.join("/")}`;
  return normalizedPath(stripped === "/" ? "/" : stripped);
}

function hasTranslation(path = "/"): boolean {
  return translatedBasePaths.has(stripLocaleFromPath(path));
}

export function localizeMarketingPath(
  locale: MarketingLocale,
  path = "/",
): string {
  const basePath = stripLocaleFromPath(path);

  if (locale === DEFAULT_LOCALE) {
    return basePath;
  }
  if (!hasTranslation(basePath)) {
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

  const suffixStart = href.search(/[?#]/);
  const pathname = suffixStart === -1 ? href : href.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : href.slice(suffixStart);
  const localizedPath = localizeMarketingPath(locale, pathname || "/");

  return new URL(`${localizedPath}${suffix}`, LANDING_SITE_URL).toString();
}
