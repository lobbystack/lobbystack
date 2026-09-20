import { SUPPORTED_LOCALES, type SupportedLocale } from "./locale";

const publicRouteSections = new Set([
  "accept-invite",
  "claim-demo",
  "confirm-email-change",
  "demo",
  "forgot-password",
  "login",
  "reset-password",
  "signup",
  "verify-email",
]);

export function localeFromPathname(pathname: string): SupportedLocale | null {
  const segment = pathname.split("/")[1];
  return SUPPORTED_LOCALES.includes(segment as SupportedLocale)
    ? segment as SupportedLocale
    : null;
}

export function stripLocalePrefix(pathname: string): string {
  const locale = localeFromPathname(pathname);
  if (!locale) return pathname || "/";
  const stripped = pathname.slice(locale.length + 1);
  return stripped || "/";
}

export function localizePublicPath(pathname: string, locale: SupportedLocale): string {
  const stripped = stripLocalePrefix(pathname);
  return `/${locale}${stripped === "/" ? "" : stripped}`;
}

export function isPublicRoutePath(pathname: string): boolean {
  const section = stripLocalePrefix(pathname).split("/")[1] ?? "";
  return publicRouteSections.has(section);
}

export function isLegacyPublicRoutePath(pathname: string): boolean {
  return localeFromPathname(pathname) === null && isPublicRoutePath(pathname);
}

export function isTokenBearingRoute(pathname: string, searchParams: URLSearchParams): boolean {
  if (searchParams.has("token") || searchParams.has("prospect_demo_token")) return true;
  const stripped = stripLocalePrefix(pathname);
  if (/^\/(?:demo|reset-password)\/[^/]+(?:\/|$)/.test(stripped)) return true;
  return false;
}
