import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isMaintenanceMode } from "@lobbystack/shared";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS, normalizeLocale } from "@/lib/locale";
import {
  isLegacyPublicRoutePath,
  isPublicRoutePath,
  isTokenBearingRoute,
  localeFromPathname,
  localizePublicPath,
} from "@/lib/locale-path";
import {
  LOCALE_HEADER,
  LOCALE_SOURCE_HEADER,
  PATHNAME_HEADER,
  type NegotiatedLocale,
  localeFromCookieHeader,
  negotiateLocale,
} from "@/lib/locale-request";

import { embeddableSecurityHeaders, isEmbeddablePath, securityHeaders } from "./security-headers";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfExemptPrefixes = ["/api/auth", "/api/webhooks", "/api/health", "/api/voice", "/api/widget"];

function isWebhookPath(pathname: string): boolean {
  return pathname.startsWith("/api/webhooks/");
}

function isMaintenanceHealthProbe(pathname: string, method: string): boolean {
  return (method === "GET" || method === "HEAD") && (pathname === "/api/health/live" || pathname === "/api/health/ready");
}

function maintenanceResponse(headers: Record<string, string>): NextResponse {
  return new NextResponse("Service temporarily unavailable.", {
    status: 503,
    headers: { ...headers, "Cache-Control": "no-store", "Retry-After": "60" },
  });
}

function applyResponsePolicy(
  response: NextResponse,
  request: NextRequest,
  headers: Record<string, string>,
  locale: NegotiatedLocale,
  cacheControl?: string,
): NextResponse {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  if (process.env.NODE_ENV === "production") response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (cacheControl) response.headers.set("Cache-Control", cacheControl);
  if (localeFromPathname(request.nextUrl.pathname) && isPublicRoutePath(request.nextUrl.pathname)) {
    response.headers.set("Content-Language", locale.locale);
    response.headers.set("Vary", "Accept-Encoding");
  }
  // Never add Set-Cookie to canonical locale-prefixed pages: shared caches must
  // be able to store those responses. Explicit selection persists separately.
  if (locale.source === "query") {
    response.cookies.set({
      name: LOCALE_COOKIE,
      value: locale.locale,
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}

function cacheControlForRequest(pathname: string, searchParams: URLSearchParams): string | undefined {
  if (isTokenBearingRoute(pathname, searchParams)) return "private, no-store";
  if (pathname.startsWith("/api/realtime") || pathname.startsWith("/api/widget/chat")) {
    return "private, no-cache, no-store, no-transform";
  }
  if (pathname.startsWith("/api/") || pathname.startsWith("/voice/") || pathname.startsWith("/embed/")) {
    return "private, no-store";
  }
  if (localeFromPathname(pathname) && isPublicRoutePath(pathname)) {
    return "public, s-maxage=300, stale-while-revalidate=3600";
  }
  if (!isPublicRoutePath(pathname) && pathname !== "/embed.js") return "private, no-store";
  return undefined;
}

function configuredOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>([request.nextUrl.origin]);
  for (const value of (process.env.AUTH_TRUSTED_ORIGINS ?? process.env.APP_BASE_URL ?? "").split(",")) {
    const origin = value.trim().replace(/\/$/, "");
    if (origin) origins.add(origin);
  }
  return origins;
}

function hasValidCsrfOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin") ?? (() => {
    const referer = request.headers.get("referer");
    if (!referer) return null;
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  })();
  return origin !== null && configuredOrigins(request).has(origin.replace(/\/$/, ""));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const headers = isEmbeddablePath(pathname) ? embeddableSecurityHeaders() : securityHeaders();

  const isApiRequest = pathname.startsWith("/api/");
  // Voice GET routes can resolve or refresh durable state too. Only the signed
  // readiness handler may run; it authenticates then reports maintenance as 503.
  const isVoiceOperation = pathname.startsWith("/voice/") && pathname !== "/voice/ready";
  if (isMaintenanceMode(process.env) && (isVoiceOperation || isWebhookPath(pathname) || (isApiRequest && !isMaintenanceHealthProbe(pathname, request.method)) || stateChangingMethods.has(request.method))) {
    // Webhooks are rejected before their handlers can validate, enqueue, or acknowledge them.
    // Health probes are the only API exemption: GET handlers can perform side effects.
    return maintenanceResponse(headers);
  }

  const negotiatedLocale = negotiateLocale({
    query: request.nextUrl.searchParams.get("lng"),
    cookie: localeFromCookieHeader(request.headers.get("cookie")),
    acceptLanguage: request.headers.get("accept-language"),
  });
  const pathLocale = localeFromPathname(pathname);
  const queryLocale = normalizeLocale(request.nextUrl.searchParams.get("lng"));

  if (isLegacyPublicRoutePath(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = localizePublicPath(pathname, negotiatedLocale.locale);
    target.searchParams.delete("lng");
    return applyResponsePolicy(
      NextResponse.redirect(target, 308),
      request,
      headers,
      negotiatedLocale,
      "private, no-store",
    );
  }

  if (pathLocale && isPublicRoutePath(pathname) && request.nextUrl.searchParams.has("lng")) {
    const targetLocale = queryLocale ?? pathLocale;
    const target = request.nextUrl.clone();
    target.pathname = localizePublicPath(pathname, targetLocale);
    target.searchParams.delete("lng");
    return applyResponsePolicy(
      NextResponse.redirect(target, 308),
      request,
      headers,
      { locale: targetLocale, source: queryLocale ? "query" : "path" },
      "private, no-store",
    );
  }

  // Dynamic application roots read these headers. Locale-prefixed public roots
  // derive their first paint directly from the path and remain prerenderable.
  const locale: NegotiatedLocale = pathLocale && isPublicRoutePath(pathname)
    ? { locale: pathLocale, source: "path" }
    : negotiatedLocale;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale.locale);
  requestHeaders.set(LOCALE_SOURCE_HEADER, locale.source);
  requestHeaders.set(PATHNAME_HEADER, pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyResponsePolicy(response, request, headers, locale, cacheControlForRequest(pathname, request.nextUrl.searchParams));

  if (stateChangingMethods.has(request.method) && pathname.startsWith("/api/") && !csrfExemptPrefixes.some((prefix) => pathname.startsWith(prefix)) && !hasValidCsrfOrigin(request)) {
    return applyResponsePolicy(
      NextResponse.json({ error: "CSRF origin validation failed." }, { status: 403 }),
      request,
      headers,
      locale,
      cacheControlForRequest(pathname, request.nextUrl.searchParams),
    );
  }
  return response;
}

export const config = {
  // Ordinary public assets keep the headers configured in next.config.ts without
  // paying for a proxy execution on every request.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$|locales/|brand/|lobbystack-logo\\.svg$).*)"],
};
