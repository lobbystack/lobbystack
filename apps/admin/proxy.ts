import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BRAND_LOGO_PATH, isMaintenanceMode, normalizeInterfaceLocale } from "@lobbystack/shared";

import { configuredAppOrigins } from "@/lib/app-origins";
import { resolveRequestHost } from "@/lib/host-resolution";
import { PARTNER_SITE_CACHE_CONTROL, isPartnerSitePath, partnerSitePath } from "@/lib/partner-site";
import { setBrandHeaders, withoutBrandHeaders, type ResolvedBrand } from "@/lib/request-brand";
import { marketingProxy } from "@/marketing/proxy";
import { MARKETING_ROUTE_PREFIX } from "@/marketing/routing";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS, localeTag } from "@/lib/locale";
import {
  isLegacyPublicRoutePath,
  isPublicRoutePath,
  isTokenBearingRoute,
  localeFromPathname,
  localizePublicPath,
  stripLocalePrefix,
} from "@/lib/locale-path";
import {
  LOCALE_HEADER,
  LOCALE_SOURCE_HEADER,
  PATHNAME_HEADER,
  type NegotiatedLocale,
  localeFromCookieHeader,
  negotiateLocale,
} from "@/lib/locale-request";

import { brandLogoSecurityHeaders, embeddableSecurityHeaders, isEmbeddablePath, securityHeaders } from "./security-headers";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// /api/v1 and /api/mcp authenticate with bearer API keys only, never cookies, so they need no CSRF
// origin check. /api/mcp refuses foreign browser origins itself.
// "/api/widget/" keeps its slash so the cookie-authenticated /api/widget-keys admin route stays guarded.
const csrfExemptPrefixes = ["/api/auth", "/api/webhooks", "/api/health", "/api/voice", "/api/widget/", "/api/v1/", "/api/mcp"];
// /api/storage/local authorizes each upload with a signed token in its URL, never a cookie, and
// API clients such as the CLI send no Origin header. It is matched exactly so routes added beside it stay guarded.
const csrfExemptPaths = new Set(["/api/storage/local"]);

function isWebhookPath(pathname: string): boolean {
  return pathname.startsWith("/api/webhooks/");
}

function hasPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Machines reach these on whatever hostname they were given: Docker and Compose
// health checks call 127.0.0.1, providers call the webhook URLs they were
// configured with (an ngrok tunnel in development), and the finance export
// authenticates with its own token. They answer on hosts no brand answers for,
// and render no brand.
// A self-hosted deployment's Caddy asks /api/tls/ask whether to issue a
// certificate, on the address Compose gives the admin.
const TLS_ASK_PATH = "/api/tls/ask";
const anyHostPrefixes = ["/api/health/", "/api/webhooks/", "/api/internal/", TLS_ASK_PATH];
// Health checks never wait on the database to learn a hostname's brand: a
// probe that did would fail, and get the container replaced, whenever the
// database is slow. Nor does the TLS ask, which looks up the name Caddy asks
// about, never the address Caddy calls on.
const unresolvedPrefixes = ["/api/health/", TLS_ASK_PATH];

// What stays on the host's domain: MCP and its OAuth server, the OpenAPI
// document, provider webhooks, the host's own brand step, White Label sign-in and signup, and
// the host's affiliate program, since a partner's businesses never get the
// host's marketing. A partner's host answers them with a 404.
const hostOnlyPrefixes = [
  "/api/mcp",
  "/.well-known/",
  "/oauth",
  "/api/oauth",
  "/api/auth/oauth2/",
  "/api/auth/admin/oauth2/",
  "/api/auth/.well-known/",
  "/api/v1/openapi.json",
  "/api/webhooks/",
  "/api/internal/",
  "/api/branding/initial",
  "/partner/signup",
  "/partner/login",
  "/api/partner/signup",
  "/affiliate",
  "/api/affiliate",
];

function isHostOnlyPath(pathname: string): boolean {
  // The OAuth consent page also answers under each locale, as /fr/oauth/consent.
  return hasPrefix(pathname, hostOnlyPrefixes) || (localeFromPathname(pathname) !== null && hasPrefix(stripLocalePrefix(pathname), ["/oauth"]));
}

function notFoundResponse(headers: Record<string, string>): NextResponse {
  return new NextResponse("Not found.", { status: 404, headers: { ...headers, "Cache-Control": "private, no-store" } });
}

const RESOLUTION_REPORT_INTERVAL_MS = 60_000;
let lastResolutionReportAt = 0;

/** Reports that the database couldn't say which brand a hostname has, at most once a minute. */
function reportResolutionFailure(error: unknown): void {
  const now = Date.now();
  if (now - lastResolutionReportAt < RESOLUTION_REPORT_INTERVAL_MS) return;
  lastResolutionReportAt = now;
  void import("@/lib/error-reporting").then(({ reportServerError }) => reportServerError(error, { operation: "resolve_host_brand" })).catch(() => undefined);
}

// What still answers during maintenance: health probes, and the TLS ask,
// since Caddy can't serve a partner's new domain, or renew one, without it.
function isMaintenanceExempt(pathname: string, method: string): boolean {
  return (method === "GET" || method === "HEAD") && (pathname === "/api/health/live" || pathname === "/api/health/ready" || pathname === TLS_ASK_PATH);
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
    response.headers.set("Content-Language", localeTag(locale.locale));
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
  if (pathname.startsWith("/api/realtime") || pathname.startsWith("/api/widget/chat") || pathname.startsWith("/api/widget/stream")) {
    return "private, no-cache, no-store, no-transform";
  }
  // The logo route caches its own versioned responses for good.
  if (pathname === BRAND_LOGO_PATH) return undefined;
  if (pathname.startsWith("/api/") || pathname.startsWith("/embed/")) {
    return "private, no-store";
  }
  if (localeFromPathname(pathname) && isPublicRoutePath(pathname)) {
    return "public, s-maxage=300, stale-while-revalidate=3600";
  }
  if (!isPublicRoutePath(pathname) && pathname !== "/embed.js") return "private, no-store";
  return undefined;
}

// On the host's domain, the same list Better Auth trusts plus the request's own
// origin. On a partner's host, only the origin the proxy resolved it on.
function trustedCsrfOrigins(request: NextRequest, resolved: ResolvedBrand | null): Set<string> {
  if (!resolved) return new Set();
  if (resolved.kind === "partner") return new Set([resolved.origin]);
  return new Set([request.nextUrl.origin, ...configuredAppOrigins(process.env, [], true)]);
}

function hasValidCsrfOrigin(request: NextRequest, resolved: ResolvedBrand | null): boolean {
  const origin = request.headers.get("origin") ?? (() => {
    const referer = request.headers.get("referer");
    if (!referer) return null;
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  })();
  return origin !== null && trustedCsrfOrigins(request, resolved).has(origin.replace(/\/$/, ""));
}

export async function proxy(request: NextRequest) {
  // A client's copy of the brand headers never reaches a page or route: every
  // branch below forwards these headers, or the proxy's own over them.
  const forwardedHeaders = withoutBrandHeaders(request.headers);

  // The marketing hosts get their own routing, headers, and trailing slashes.
  // They're the host's own domain.
  const marketing = marketingProxy(request, process.env, setBrandHeaders(new Headers(forwardedHeaders), { kind: "host" }));
  if (marketing) return marketing;

  const { pathname } = request.nextUrl;
  const headers = isEmbeddablePath(pathname) ? embeddableSecurityHeaders() : pathname === BRAND_LOGO_PATH ? brandLogoSecurityHeaders() : securityHeaders();

  // The standalone server builds request.url from the address it listens on,
  // so the visitor's hostname comes from the Host header.
  const anyHost = hasPrefix(pathname, anyHostPrefixes);
  let resolved: ResolvedBrand | null = null;
  if (!hasPrefix(pathname, unresolvedPrefixes)) {
    try {
      resolved = await resolveRequestHost(request.headers.get("host") ?? request.nextUrl.host);
    } catch (error) {
      reportResolutionFailure(error);
      // Without the database, a hostname that isn't the host's may be a
      // partner's: answer nothing under the wrong brand.
      if (!anyHost) return maintenanceResponse(headers);
    }
  }
  // Nobody can point a domain at this deployment and get the dashboard under it.
  if (!resolved && !anyHost) return notFoundResponse(headers);
  if (resolved?.kind === "partner" && isHostOnlyPath(pathname)) return notFoundResponse(headers);

  const isApiRequest = pathname.startsWith("/api/");
  if (isMaintenanceMode(process.env) && (isWebhookPath(pathname) || (isApiRequest && !isMaintenanceExempt(pathname, request.method)) || stateChangingMethods.has(request.method))) {
    // Webhooks are rejected before their handlers can validate, enqueue, or acknowledge them.
    // Health probes and the TLS ask are the only API exemptions: GET handlers can perform side effects.
    return maintenanceResponse(headers);
  }

  // The marketing site's internal routes only answer on its own hosts, and
  // partner pages only through the rewrite below.
  if (pathname === MARKETING_ROUTE_PREFIX || pathname.startsWith(`${MARKETING_ROUTE_PREFIX}/`) || isPartnerSitePath(pathname)) {
    return notFoundResponse(headers);
  }

  // next.config.ts skips Next.js' own trailing-slash redirect because marketing
  // pages keep theirs. Dashboard and API paths still drop it. This reads the raw
  // URL because NextURL can hide the slash and would put it back.
  const target = new URL(request.url);
  if (target.pathname !== "/" && target.pathname.endsWith("/")) {
    target.pathname = target.pathname.replace(/\/+$/, "") || "/";
    const response = NextResponse.redirect(target, 308);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  }

  const negotiatedLocale = negotiateLocale({
    query: request.nextUrl.searchParams.get("lng"),
    cookie: localeFromCookieHeader(request.headers.get("cookie")),
    acceptLanguage: request.headers.get("accept-language"),
  });
  const pathLocale = localeFromPathname(pathname);
  const queryLocale = normalizeInterfaceLocale(request.nextUrl.searchParams.get("lng"));

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

  // The website widget's loader names the business's language in the chat's
  // address, so the chat paints in it from the start. That is the business's
  // choice, not the visitor's, so unlike ?lng= it is never saved.
  const widgetLocale = pathname.startsWith("/embed/") ? normalizeInterfaceLocale(request.nextUrl.searchParams.get("locale")) : null;

  // Dynamic application roots read these headers. Locale-prefixed public roots
  // derive their first paint directly from the path and remain prerenderable.
  const locale: NegotiatedLocale = widgetLocale
    ? { locale: widgetLocale, source: "path" }
    : pathLocale && isPublicRoutePath(pathname)
      ? { locale: pathLocale, source: "path" }
      : negotiatedLocale;
  const requestHeaders = setBrandHeaders(forwardedHeaders, resolved);
  requestHeaders.set(LOCALE_HEADER, locale.locale);
  requestHeaders.set(LOCALE_SOURCE_HEADER, locale.source);
  requestHeaders.set(PATHNAME_HEADER, pathname);

  // A build can't know a partner's brand, so on a partner's host the pages the
  // host prerenders come from the partner's own copy, kept for the cache window.
  const partnerPage = resolved?.kind === "partner" ? partnerSitePath(resolved.partnerId, pathname) : null;
  if (partnerPage) {
    const target = new URL(request.url);
    target.pathname = partnerPage;
    const cacheControl = isTokenBearingRoute(pathname, request.nextUrl.searchParams) ? "private, no-store" : PARTNER_SITE_CACHE_CONTROL;
    return applyResponsePolicy(NextResponse.rewrite(target, { request: { headers: requestHeaders } }), request, headers, locale, cacheControl);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyResponsePolicy(response, request, headers, locale, cacheControlForRequest(pathname, request.nextUrl.searchParams));

  if (stateChangingMethods.has(request.method) && pathname.startsWith("/api/") && !csrfExemptPaths.has(pathname) && !csrfExemptPrefixes.some((prefix) => pathname.startsWith(prefix)) && !hasValidCsrfOrigin(request, resolved)) {
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
  matcher: ["/((?!_next/static|_next/image|locales/|brand/|lobbystack-logo\\.svg$).*)"],
};
