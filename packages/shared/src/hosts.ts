// The hostnames a request can arrive on, and which of them are the host's own
// domain. Brands answers the host's own domain with the host brand without
// reading the database, a partner's domain with the partner's brand, and any
// other hostname with no brand at all.

// A hostname of letters, digits and hyphens, such as app.example.com or
// 127.0.0.1. Underscores, spaces and other characters a DNS name can't hold
// make it no hostname.
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const BRACKETED_IPV6 = /^\[[0-9a-f:.]+\]$/;

// Where links point when APP_BASE_URL is unset, as the host brand assumes.
const DEFAULT_APP_HOSTNAME = "localhost";

// The names a developer's own machine answers to, which reach the dashboard
// outside production whatever APP_BASE_URL says.
const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

/**
 * The hostname a Host header or a URL's host names, lowercased and without its
 * port or trailing dot, such as acme.example.com for `Acme.Example.com.:443`,
 * or null when it names none. An IPv6 address keeps its brackets.
 */
export function normalizeHostname(host: string | null | undefined): string | null {
  const value = host?.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    const address = end > 0 ? value.slice(0, end + 1) : "";
    const rest = end > 0 ? value.slice(end + 1) : value;
    return BRACKETED_IPV6.test(address) && (rest === "" || /^:\d{1,5}$/.test(rest)) ? address : null;
  }
  const withoutPort = value.replace(/:\d{1,5}$/, "");
  const hostname = withoutPort.endsWith(".") ? withoutPort.slice(0, -1) : withoutPort;
  return HOSTNAME.test(hostname) ? hostname : null;
}

function urlHostname(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? normalizeHostname(url.host) : null;
  } catch {
    return null;
  }
}

function list(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

/**
 * The hostnames that are the host's own domain in every environment: the one
 * in APP_BASE_URL, the plain origins in AUTH_TRUSTED_ORIGINS, and the
 * marketing site's MARKETING_HOSTS, which serve the dashboard when a build
 * leaves the marketing site out. Patterns such as `*.example.com` aren't one.
 */
export function hostDomainHostnames(env: Readonly<Record<string, string | undefined>>): Set<string> {
  const names = new Set<string>();
  const add = (hostname: string | null) => { if (hostname) names.add(hostname); };
  add(env.APP_BASE_URL?.trim() ? urlHostname(env.APP_BASE_URL) : DEFAULT_APP_HOSTNAME);
  for (const origin of list(env.AUTH_TRUSTED_ORIGINS)) add(urlHostname(origin));
  for (const host of list(env.MARKETING_HOSTS)) add(normalizeHostname(host));
  return names;
}

/** The part of a host-and-path string before its first slash. A regex here backtracks on long runs of slashes. */
export function beforePath(value: string): string {
  const slash = value.indexOf("/");
  return slash === -1 ? value : value.slice(0, slash);
}

function matchesDevOrigin(hostname: string, entry: string): boolean {
  const pattern = entry.toLowerCase();
  if (pattern.startsWith("*.")) return hostname.endsWith(pattern.slice(1));
  return normalizeHostname(beforePath(pattern.replace(/^https?:\/\//, ""))) === hostname;
}

/**
 * Whether a request on this hostname is on the host's own domain, so it gets
 * the host brand. Outside production that also covers localhost, 127.0.0.1
 * and [::1], and the extra hosts in ALLOWED_DEV_ORIGINS such as a tunnel's,
 * all of which reach the dashboard in development today.
 */
export function isHostDomain(hostname: string, env: Readonly<Record<string, string | undefined>>): boolean {
  if (hostDomainHostnames(env).has(hostname)) return true;
  if (env.NODE_ENV === "production") return false;
  return LOOPBACK_HOSTNAMES.includes(hostname) || list(env.ALLOWED_DEV_ORIGINS).some((entry) => matchesDevOrigin(hostname, entry));
}

/** The partner subdomain label a hostname directly under the partner base domain carries, such as acme for acme.example.com, or null. */
export function partnerSubdomainLabel(hostname: string, baseDomain: string): string | null {
  const suffix = `.${baseDomain}`;
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  return label && !label.includes(".") ? label : null;
}
