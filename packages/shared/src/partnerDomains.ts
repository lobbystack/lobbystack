// A partner's own domain, such as app.acmeagency.com: what the console's
// Branding & domain page sends, and what it shows while the domain is set up.

import { beforePath, normalizeHostname } from "./hosts";

/** Where a partner's own domain stands: waiting for its DNS records, serving the partner's dashboard, or given up on by the provider. */
export type CustomDomainStatus = "pending" | "active" | "failed";

/** A DNS record the partner adds at its DNS provider, and whether it checks out yet. */
export type CustomDomainDnsRecord = {
  type: "CNAME" | "TXT";
  /** The full name the record goes on, such as app.acmeagency.com. */
  name: string;
  value: string;
  verified: boolean;
};

export const CUSTOM_DOMAIN_MAX_LENGTH = 253;

/**
 * Where the partner publishes its domain's verification token as a TXT
 * record, beside the CNAME: _domain-verification.app.acmeagency.com. Only
 * whoever controls the domain's DNS can add it, so a partner can never take a
 * domain someone else pointed at the deployment. The name stays neutral,
 * since the partner's own DNS shows it.
 */
export function customDomainVerificationName(hostname: string): string {
  return `_domain-verification.${hostname}`;
}

/**
 * The hostname a partner typed for its own domain, lowercased, without a
 * scheme, path, port or trailing dot, or null when it isn't one. It must be a
 * subdomain, such as app.acmeagency.com, since a domain's apex can't hold the
 * CNAME record the partner points at the deployment: at least three labels,
 * ending in a top-level domain of letters. An IP address isn't one.
 */
export function normalizeCustomDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = beforePath(value.trim().toLowerCase().replace(/^https?:\/\//, ""));
  if (!trimmed || trimmed.length > CUSTOM_DOMAIN_MAX_LENGTH + 1 || /:\d*$/.test(trimmed)) return null;
  const hostname = normalizeHostname(trimmed);
  if (!hostname || hostname.startsWith("[")) return null;
  const labels = hostname.split(".");
  return labels.length >= 3 && /^[a-z]{2,63}$|^xn--[a-z0-9-]{1,59}$/.test(labels.at(-1)!) ? hostname : null;
}
