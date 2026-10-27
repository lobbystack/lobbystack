/** Only allow local paths; browsers interpret backslashes and control characters as URL syntax. */
import type { SupportedLocale } from "./locale";
import { localizePublicPath } from "./locale-path";

export function getSafeReturnTo(value: string | null | undefined): string | null {
  // Intentional control-character range: browsers treat these as URL syntax.
  // eslint-disable-next-line no-control-regex
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/**
 * White Label's sign-in or sign-up, on the host's domain, which brings the
 * person back to `value`. Sign-up goes straight back to a partner signup link
 * instead, so the link's invitation stays at the top of the address.
 */
export function buildPartnerAuthPath(path: "/login" | "/signup", value: string | null | undefined): string {
  const returnTo = getSafeReturnTo(value);
  if (path === "/signup" && returnTo && /^\/partner\/signup(?:\?|$)/.test(returnTo)) {
    // Rebuilt from its invitation alone, so nothing else from the address reaches the link.
    const invitation = new URLSearchParams(returnTo.slice("/partner/signup".length)).get("invitation");
    return invitation ? `/partner/signup?invitation=${encodeURIComponent(invitation)}` : "/partner/signup";
  }
  return returnTo ? `/partner${path}?returnTo=${encodeURIComponent(returnTo)}` : `/partner${path}`;
}

/** White Label's sign-in, which brings the person back to `value` in the partner console. */
export function buildPartnerLoginPath(value: string | null | undefined): string {
  return buildPartnerAuthPath("/login", value);
}

/**
 * Where someone signs in to the partner console: White Label's sign-in on the
 * host's domain, or the dashboard's sign-in on a partner's host, which answers
 * White Label's pages with a 404.
 */
export function buildPartnerConsoleLoginPath(onPartnerHost: boolean, value: string | null | undefined, locale?: SupportedLocale): string {
  return onPartnerHost ? buildAuthPathWithReturnTo("/login", value, locale) : buildPartnerLoginPath(value);
}

export function buildAuthPathWithReturnTo(
  path: "/login" | "/signup",
  value: string | null | undefined,
  locale?: SupportedLocale,
): string {
  const authPath = locale ? localizePublicPath(path, locale) : path;
  const returnTo = getSafeReturnTo(value);
  return returnTo ? `${authPath}?returnTo=${encodeURIComponent(returnTo)}` : authPath;
}
