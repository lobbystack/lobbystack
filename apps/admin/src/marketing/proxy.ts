import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { DEFAULT_LOCALE } from "@/lib/locale";
import { localeFromCookieHeader, negotiateLocale } from "@/lib/locale-request";

import { marketingSecurityHeaders } from "../../security-headers";
import { marketingSiteBuilt } from "./build";
import { MARKETING_REDIRECTS, assetCacheControl, marketingResponseHeaders } from "./response-headers";
import {
  MARKETING_ROUTE_PREFIX,
  canonicalMarketingPathname,
  isCrawler,
  isLocaleNegotiablePath,
  localizeMarketingPath,
  marketingHosts,
  resolveMarketingRoute,
  splitMarketingPath,
} from "./routing";

const MARKETING_HSTS = "max-age=31536000; includeSubDomains; preload";
// Pages are prerendered, so the server answers them from disk. Browsers
// revalidate every time, so a language picked in the switcher applies at once.
const PAGE_CACHE_CONTROL = "public, max-age=0, must-revalidate";
// Only Cloudflare reads this header. It keeps a page fresh for five minutes, then
// serves the old copy for up to a day while it fetches a new one. Its Cache Rule
// skips requests whose language or Markdown preference could change the response,
// and each release purges the cache (docs/deployment/marketing-site.md).
const EDGE_CACHE_CONTROL = "max-age=300, stale-while-revalidate=86400";

type Env = Readonly<Record<string, string | undefined>>;

function withMarketingHeaders(response: NextResponse, env: Env, cacheControl?: string, pathname?: string): NextResponse {
  for (const [name, value] of Object.entries(marketingSecurityHeaders(env as Record<string, string | undefined>))) {
    response.headers.set(name, value);
  }
  if (pathname !== undefined) {
    for (const [name, value] of Object.entries(marketingResponseHeaders(pathname, splitMarketingPath(pathname).rest))) {
      response.headers.set(name, value);
    }
  }
  if (env.NODE_ENV === "production") response.headers.set("Strict-Transport-Security", MARKETING_HSTS);
  if (cacheControl) response.headers.set("Cache-Control", cacheControl);
  return response;
}

function cachedAtEdge(response: NextResponse): NextResponse {
  response.headers.set("Cloudflare-CDN-Cache-Control", EDGE_CACHE_CONTROL);
  return response;
}

function wantsMarkdown(request: NextRequest): boolean {
  return (request.headers.get("accept") ?? "")
    .split(",")
    .some((part) => part.trim().toLowerCase().startsWith("text/markdown"));
}

// Dev hosts such as lobbystack.localhost run on plain HTTP; every real host is HTTPS.
function isDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

/**
 * The URL the visitor asked for. The standalone server builds `request.url`
 * from the address it listens on, so the host comes from the Host header, and
 * Cloudflare's TLS ends before this server sees the request.
 */
function visitorUrl(request: NextRequest): URL {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) {
    const parsed = new URL(`http://${host}`);
    url.hostname = parsed.hostname;
    url.port = parsed.port;
  }
  if (!isDevHost(url.hostname)) {
    url.protocol = "https:";
    url.port = "";
  }
  return url;
}

// A plain URL, because NextURL puts back the request's own trailing slash
// whenever it serializes, and marketing paths add or drop one on purpose.
function withPathname(url: URL | string, pathname: string): URL {
  const target = new URL(url);
  target.pathname = pathname;
  return target;
}

// Rewrites keep the server's own origin. A rewrite to the visitor's host is an
// external rewrite: Next.js would fetch it over HTTP and run this proxy again.
function rewriteTo(request: NextRequest, pathname: string, requestHeaders: Headers | undefined): NextResponse {
  return NextResponse.rewrite(withPathname(request.url, pathname), requestHeaders ? { request: { headers: requestHeaders } } : undefined);
}

let warnedUnbuilt = false;

/**
 * Serves the marketing site on the hosts named in `MARKETING_HOSTS`, and
 * returns null for every other host so the dashboard proxy handles it. The
 * pages it serves get `requestHeaders` in place of the visitor's, so the
 * dashboard proxy decides what reaches them.
 */
export function marketingProxy(request: NextRequest, env: Env = process.env, requestHeaders?: Headers): NextResponse | null {
  const hosts = marketingHosts(env);
  if (!hosts) return null;
  if (!marketingSiteBuilt()) {
    if (!warnedUnbuilt) {
      warnedUnbuilt = true;
      console.warn("MARKETING_HOSTS is set, but this build left the marketing site out. Build the admin image with MARKETING_SITE=true to serve it.");
    }
    return null;
  }
  const url = visitorUrl(request);
  const hostname = url.hostname.toLowerCase();
  const { pathname } = url;

  if (hosts.aliases.has(hostname)) {
    // Straight to the canonical path too, so www visitors pay one redirect.
    const target = withPathname(url, canonicalMarketingPathname(pathname));
    target.hostname = hosts.canonical;
    return withMarketingHeaders(NextResponse.redirect(target, 301), env, "public, max-age=3600");
  }
  if (hostname !== hosts.canonical) return null;

  const retired = MARKETING_REDIRECTS[canonicalMarketingPathname(pathname)];
  if (retired) {
    return withMarketingHeaders(NextResponse.redirect(withPathname(url, retired), 301), env, "public, max-age=3600", pathname);
  }

  const route = resolveMarketingRoute(pathname, env.INDEXNOW_KEY);
  if (route.kind === "asset") {
    const cacheControl = assetCacheControl(pathname);
    const response = withMarketingHeaders(NextResponse.next(requestHeaders ? { request: { headers: requestHeaders } } : undefined), env, cacheControl, pathname);
    // Pagefind's loader, UI and wasm keep their names from build to build, so
    // the edge keeps them like pages and each release purges them.
    return pathname.startsWith("/pagefind/") && !cacheControl ? cachedAtEdge(response) : response;
  }
  if (route.kind === "redirect") {
    const target = withPathname(url, route.location);
    return withMarketingHeaders(NextResponse.redirect(target, 301), env, "public, max-age=3600", pathname);
  }

  const readsPage = request.method === "GET" || request.method === "HEAD";
  const negotiable = isLocaleNegotiablePath(pathname);
  if (readsPage && negotiable && !isCrawler(request.headers.get("user-agent"))) {
    // A language picked in the switcher wins over the browser's languages.
    const { locale } = negotiateLocale({
      cookie: localeFromCookieHeader(request.headers.get("cookie")),
      acceptLanguage: request.headers.get("accept-language"),
    });
    if (locale !== DEFAULT_LOCALE) {
      const target = withPathname(url, localizeMarketingPath(canonicalMarketingPathname(pathname), locale));
      const response = withMarketingHeaders(NextResponse.redirect(target, 302), env, "private, no-store", pathname);
      response.headers.set("Vary", "Accept-Language, Cookie");
      return response;
    }
  }

  const { locale, rest } = splitMarketingPath(pathname);
  if (readsPage && rest === "/" && wantsMarkdown(request)) {
    const response = cachedAtEdge(withMarketingHeaders(rewriteTo(request, `${MARKETING_ROUTE_PREFIX}/${locale}/md/index`, requestHeaders), env, PAGE_CACHE_CONTROL, pathname));
    response.headers.set("Vary", "Accept");
    return response;
  }

  // Social cards never change under the same URL; everything else revalidates.
  if (/^\/og\/.+\.jpg$/.test(pathname)) {
    return withMarketingHeaders(rewriteTo(request, route.internalPath, requestHeaders), env, "public, max-age=31536000, immutable", pathname);
  }
  const response = cachedAtEdge(withMarketingHeaders(rewriteTo(request, route.internalPath, requestHeaders), env, PAGE_CACHE_CONTROL, pathname));
  if (negotiable) response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
}
