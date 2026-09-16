import { posthogSources, recordingStorageSource, webCallConnectSource } from "./csp";

/**
 * Single source of truth for the security headers the admin app sends.
 *
 * Both the proxy and next.config.ts emit these values, so their ownership lives here.
 * Embeddable routes intentionally differ: they must stay frameable across origins, and
 * the server config must not re-add the global X-Frame-Options: DENY on top of them.
 */

export function securityHeaders(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const webCallOrigin = webCallConnectSource(env);
  const recordingOrigin = recordingStorageSource(env);
  const posthogOrigin = posthogSources(env).join(" ");
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com ${posthogOrigin}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      `connect-src 'self' ${posthogOrigin} https://challenges.cloudflare.com${webCallOrigin ? ` ${webCallOrigin}` : ""}${recordingOrigin ? ` ${recordingOrigin}` : ""} wss:`,
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

/** The same policy set, but frameable across origins and without the DENY framing header. */
export function embeddableSecurityHeaders(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const base = securityHeaders(env);
  const { "X-Frame-Options": _deny, ...rest } = base;
  const csp = base["Content-Security-Policy"] ?? "";
  return {
    ...rest,
    "Content-Security-Policy": csp.replace("frame-ancestors 'none'", "frame-ancestors *"),
  };
}

/** Header records converted to the shape the next.config.ts headers array expects. */
export function toNextHeaderList(headers: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

/** Iframe document routes that must stay embeddable across origins. */
export const EMBED_PATH_PREFIXES = ["/embed.js", "/embed/"] as const;

export function isEmbeddablePath(pathname: string): boolean {
  return EMBED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

