import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isMaintenanceMode } from "@lobbystack/shared";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from "@/lib/locale";
import {
  LOCALE_HEADER,
  LOCALE_SOURCE_HEADER,
  PATHNAME_HEADER,
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

  // The root layout reads these request headers so the first paint is rendered in
  // the negotiated locale for the route being requested.
  const locale = negotiateLocale({
    query: request.nextUrl.searchParams.get("lng"),
    cookie: localeFromCookieHeader(request.headers.get("cookie")),
    acceptLanguage: request.headers.get("accept-language"),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale.locale);
  requestHeaders.set(LOCALE_SOURCE_HEADER, locale.source);
  requestHeaders.set(PATHNAME_HEADER, pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  if (process.env.NODE_ENV === "production") response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
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

  if (stateChangingMethods.has(request.method) && pathname.startsWith("/api/") && !csrfExemptPrefixes.some((prefix) => pathname.startsWith(prefix)) && !hasValidCsrfOrigin(request)) {
    return NextResponse.json({ error: "CSRF origin validation failed." }, { status: 403, headers });
  }
  return response;
}

export const config = {
  // Ordinary public assets keep the headers configured in next.config.ts without
  // paying for a proxy execution on every request.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$|locales/|brand/|lobbystack-logo\\.svg$).*)"],
};
