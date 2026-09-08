import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { recordingStorageSource, webCallConnectSource } from "./csp";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfExemptPrefixes = ["/api/auth", "/api/webhooks", "/api/health", "/api/voice", "/api/widget"];

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

function securityHeaders(): Record<string, string> {
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  let posthogOrigin = "https://us.i.posthog.com";
  try {
    posthogOrigin = new URL(posthogHost).origin;
  } catch {
    // Keep the safe default when a public analytics URL is malformed.
  }
  const webCallOrigin = webCallConnectSource();
  const recordingOrigin = recordingStorageSource();
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://*.posthog.com`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https:`,
      `connect-src 'self' ${posthogOrigin} https://challenges.cloudflare.com https://*.posthog.com${webCallOrigin ? ` ${webCallOrigin}` : ""}${recordingOrigin ? ` ${recordingOrigin}` : ""} wss:`,
      "font-src 'self' data:",
      "frame-src 'self' https://challenges.cloudflare.com",
      "form-action 'self'",
      `media-src 'self' blob:${recordingOrigin ? ` ${recordingOrigin}` : ""}`,
      "worker-src 'self' blob:",
    ].join("; "),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-DNS-Prefetch-Control": "off",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  };
}

function embeddableSecurityHeaders(): Record<string, string> {
  const base = securityHeaders();
  const csp = base["Content-Security-Policy"] ?? "";
  return {
    ...base,
    "Content-Security-Policy": csp.replace("frame-ancestors 'none'", "frame-ancestors *"),
  };
}

export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  const isEmbedPath = request.nextUrl.pathname === "/embed.js" || request.nextUrl.pathname.startsWith("/embed/");
  const headers = isEmbedPath ? embeddableSecurityHeaders() : securityHeaders();
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  if (isEmbedPath) response.headers.delete("X-Frame-Options");
  if (process.env.NODE_ENV === "production") response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (stateChangingMethods.has(request.method) && request.nextUrl.pathname.startsWith("/api/") && !csrfExemptPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix)) && !hasValidCsrfOrigin(request)) {
    return NextResponse.json({ error: "CSRF origin validation failed." }, { status: 403, headers });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
