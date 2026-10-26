import { isUuid, normalizeHostname } from "@lobbystack/shared";

import { configuredAppOrigins } from "./app-origins";

// The proxy resolves each request's Host header to a brand before any page or
// route runs, and passes the answer on in these request headers. It deletes
// any copy a client sent first, so what arrives here is the proxy's own.
// Nothing downstream reads the Host header to choose a brand or trust an
// origin.

/** The brand the proxy resolved the request to: `host`, or `partner:<partner id>`. Absent when it resolved none. */
export const BRAND_HEADER = "x-lobbystack-brand";
/** On a partner's host, the origin the visitor used, such as https://acme.receptionistportal.com. */
export const BRAND_ORIGIN_HEADER = "x-lobbystack-brand-origin";

const BRAND_HEADERS = [BRAND_HEADER, BRAND_ORIGIN_HEADER] as const;

/** What the proxy resolved a request's host to. A partner's host also carries the origin it was reached on. */
export type ResolvedBrand = { kind: "host" } | { kind: "partner"; partnerId: string; origin: string };

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The origin a visitor used to reach this Host header: the scheme of
 * APP_BASE_URL, since TLS ends before the admin, with the Host header's name
 * and port. Null for a Host header that names no hostname.
 */
export function visitorOrigin(host: string, env: Env = process.env): string | null {
  const hostname = normalizeHostname(host);
  if (!hostname) return null;
  const port = /:(\d{1,5})$/.exec(host.trim())?.[1];
  let protocol = "http:";
  try {
    protocol = new URL(env.APP_BASE_URL?.trim() || "http://localhost").protocol;
  } catch {
    // An unreadable APP_BASE_URL leaves plain HTTP, as auth assumes without one.
  }
  try {
    return new URL(`${protocol}//${hostname}${port ? `:${port}` : ""}`).origin;
  } catch {
    return null;
  }
}

/** A copy of these headers with any brand header a client sent removed. */
export function withoutBrandHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  for (const name of BRAND_HEADERS) headers.delete(name);
  return headers;
}

/** Sets the brand headers for what the proxy resolved, after removing any a client sent. */
export function setBrandHeaders(headers: Headers, resolved: ResolvedBrand | null): Headers {
  for (const name of BRAND_HEADERS) headers.delete(name);
  if (resolved?.kind === "host") headers.set(BRAND_HEADER, "host");
  if (resolved?.kind === "partner") {
    headers.set(BRAND_HEADER, `partner:${resolved.partnerId}`);
    headers.set(BRAND_ORIGIN_HEADER, resolved.origin);
  }
  return headers;
}

/** What the proxy resolved this request to, from its headers, or null when it resolved nothing. */
export function readResolvedBrand(headers: Headers): ResolvedBrand | null {
  const value = headers.get(BRAND_HEADER)?.trim();
  if (value === "host") return { kind: "host" };
  const partnerId = value?.startsWith("partner:") ? value.slice("partner:".length) : null;
  const origin = headers.get(BRAND_ORIGIN_HEADER)?.trim();
  if (!partnerId || !isUuid(partnerId) || !origin) return null;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin ? { kind: "partner", partnerId, origin } : null;
  } catch {
    return null;
  }
}

/**
 * The origins a cookie-authenticated browser request may come from: on the
 * host's domain, the host's configured origins (APP_BASE_URL first, then
 * AUTH_TRUSTED_ORIGINS); on a partner's host, only that host's own origin,
 * once the proxy resolved it. A request the proxy resolved to no brand trusts
 * none.
 */
export function trustedOriginsFor(resolved: ResolvedBrand | null, env: Env = process.env): string[] {
  if (!resolved) return [];
  return resolved.kind === "partner" ? [resolved.origin] : configuredAppOrigins(env);
}

/** The request's trusted origins, from what the proxy passed on. */
export function trustedRequestOrigins(headers: Headers, env: Env = process.env): string[] {
  return trustedOriginsFor(readResolvedBrand(headers), env);
}

/**
 * Whether a request may open this partner's console: on a partner's host only
 * that partner's, so one partner's brand never frames another partner's
 * console, and on the host's domain any partner the person is on the team of.
 */
export function opensPartnerConsole(resolved: ResolvedBrand | null, partnerId: string): boolean {
  return resolved?.kind !== "partner" || resolved.partnerId.toLowerCase() === partnerId.toLowerCase();
}

/** The origin of a partner's host the request was resolved to, or null on the host's domain. */
export function partnerRequestOrigin(headers: Headers): string | null {
  const resolved = readResolvedBrand(headers);
  return resolved?.kind === "partner" ? resolved.origin : null;
}

/**
 * The brand whose businesses a request lists and opens: the partner's on its
 * host, and the host's on the host's domain. A request the proxy resolved to
 * no brand gets the host's, so it can never reach a partner's business.
 */
export function requestBrandScope(headers: Headers): { kind: "host" } | { kind: "partner"; partnerId: string } {
  const resolved = readResolvedBrand(headers);
  return resolved?.kind === "partner" ? { kind: "partner", partnerId: resolved.partnerId } : { kind: "host" };
}

/**
 * On a partner's host, where a signed-in person with no business there
 * lands instead of the host's onboarding, since a partner's domain makes no
 * direct business.
 */
export const NO_BUSINESSES_PATH = "/no-businesses";
