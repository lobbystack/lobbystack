import { localizePublicPath } from "./locale-path";
import { localeFromRequestHeaders } from "./locale-request";

// Better Auth sends the browser to fixed paths during authorization. These
// helpers turn those hops into the app's localized pages.

/** Parameters Better Auth adds when it signs an authorization request. */
const signatureParams = new Set(["sig", "exp", "ba_iat", "ba_pl", "ba_param"]);

/**
 * The authorization request without Better Auth's signature, as the client
 * sent it. Replaying it after sign-in is the same as the client's first request.
 */
export function authorizePathFromSignedQuery(search: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const [name, value] of search) if (!signatureParams.has(name)) params.append(name, value);
  return `/api/auth/oauth2/authorize?${params.toString()}`;
}

/** Sends a signed-out person to the login page, then back into the authorization request. */
export function oauthSignInRedirect(request: Request): Response {
  const url = new URL(request.url);
  const { locale } = localeFromRequestHeaders(request.headers);
  const returnTo = authorizePathFromSignedQuery(url.searchParams);
  const target = `${localizePublicPath("/login", locale)}?returnTo=${encodeURIComponent(returnTo)}`;
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
}

/** Sends the browser to the consent page in the person's language, keeping the signed query intact. */
export function oauthConsentRedirect(request: Request): Response {
  const url = new URL(request.url);
  const { locale } = localeFromRequestHeaders(request.headers);
  const target = `/${locale}/oauth/consent${url.search}`;
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
}
