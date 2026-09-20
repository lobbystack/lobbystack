/** Only allow local paths; browsers interpret backslashes and control characters as URL syntax. */
import type { SupportedLocale } from "./locale";
import { localizePublicPath } from "./locale-path";

export function getSafeReturnTo(value: string | null | undefined): string | null {
  // Intentional control-character range: browsers treat these as URL syntax.
  // eslint-disable-next-line no-control-regex
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
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
