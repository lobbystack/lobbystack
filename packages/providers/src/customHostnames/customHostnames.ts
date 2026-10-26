import { lookup, resolveTxt } from "node:dns/promises";

import { partnerFeatures, type CustomDomainDnsRecord } from "@lobbystack/shared";

// Partners' own domains, such as app.acmeagency.com, get a certificate from
// whatever ends TLS in front of the admin. On the cloud that's Cloudflare for
// SaaS: the worker registers each domain as a custom hostname in the partner
// base domain's zone, and Cloudflare issues the certificate once the partner's
// CNAME points at it. On a self-hosted deployment it's the host's Caddy, which
// issues a certificate on demand once /api/tls/ask approves the hostname, so
// the Caddy adapter only checks that the domain's DNS reaches the deployment.
// Either way, the domain module also asks DNS for the partner's TXT record,
// through a TxtLookup, before it lets the domain go live.

export type DnsRecord = CustomDomainDnsRecord;

/** What the provider says of a hostname: still waiting, serving with its certificate, or given up on. */
export type CustomHostnameStatus = {
  state: "pending" | "active" | "failed";
  /** The records the partner adds at its DNS provider, and whether each checks out yet. */
  records: DnsRecord[];
  /** What the provider says is wrong, in its own words, for the partner to read. */
  errors: string[];
};

/**
 * The provider turned a hostname down, as Cloudflare does for a name it won't
 * serve, with reasons in its own words for the partner to read. It may take
 * the hostname once the reason is fixed, so the worker asks again later.
 */
export class CustomHostnameRefusedError extends Error {
  readonly code = "custom_hostname_refused";

  constructor(readonly reasons: string[]) {
    super(`The custom hostname provider refused the hostname${reasons[0] ? `: ${reasons[0]}` : "."}`);
  }
}

export interface CustomHostnameProvider {
  /** Which kind of provider this is, so a domain is only ever checked by the provider that set it up. */
  readonly kind: "cloudflare" | "caddy";
  /**
   * Registers a hostname, or finds the one registered earlier, and returns
   * its id with the provider. Throws CustomHostnameRefusedError when the
   * provider turns the hostname down, and any other error when it can't answer.
   */
  create(hostname: string): Promise<{ id: string }>;
  status(id: string): Promise<CustomHostnameStatus>;
  /** Removes a hostname. Removing one the provider no longer has succeeds. */
  remove(id: string): Promise<void>;
}

export type CloudflareForSaasConfig = {
  apiToken: string;
  zoneId: string;
  /**
   * The hostname partners point their CNAME at. Without one, the zone's
   * fallback origin, which Cloudflare sends custom hostnames' traffic to.
   */
  cnameTarget?: string | null;
  baseUrl?: string;
  fetch?: typeof fetch;
};

type CloudflareError = { code?: number; message?: string };
type CloudflareEnvelope<T> = { success?: boolean; errors?: CloudflareError[]; result?: T };
type CloudflareCustomHostname = {
  id: string;
  hostname: string;
  status?: string;
  verification_errors?: string[];
  ssl?: {
    status?: string;
    validation_records?: Array<{ txt_name?: string; txt_value?: string }>;
    validation_errors?: Array<{ message?: string }>;
  };
};

// Cloudflare's answer to creating a hostname the zone already has.
const DUPLICATE_HOSTNAME = 1406;
// Statuses with which Cloudflare turns the request itself down, saying why.
// Others, such as 401 or 403 for the host's token, 429 or a 5xx, say nothing
// the partner can act on.
const REFUSED_HOSTNAME_STATUSES = new Set([400, 409, 422]);
// Hostname states Cloudflare won't recover from without the hostname being added again.
const FAILED_HOSTNAME_STATES = new Set(["blocked", "deleted", "pending_deletion"]);
// Certificate states that mean Cloudflare stopped trying to issue or deploy it.
const FAILED_CERTIFICATE_STATES = new Set(["expired", "deleted", "initializing_timed_out", "validation_timed_out", "issuance_timed_out", "deployment_timed_out", "deletion_timed_out"]);
// Certificate states before Cloudflare could validate the hostname.
const UNVALIDATED_CERTIFICATE_STATES = new Set(["initializing", "pending_validation"]);

class CloudflareRequestError extends Error {
  constructor(readonly status: number, readonly errors: CloudflareError[]) {
    super(`Cloudflare request failed with status ${status}${errors[0]?.message ? `: ${errors[0].message}` : "."}`);
  }
}

/**
 * Cloudflare for SaaS custom hostnames in the partner base domain's zone. A
 * hostname goes live when both the hostname and its certificate are active.
 * Certificates are validated over HTTP, which works as soon as the partner's
 * CNAME reaches Cloudflare, so the partner adds one record. When Cloudflare
 * still asks for a TXT record, as it does for a domain the partner proxies
 * through its own Cloudflare account, the records list it too.
 */
export class CloudflareForSaas implements CustomHostnameProvider {
  readonly kind = "cloudflare" as const;
  private fallbackOrigin: Promise<string> | null = null;

  constructor(private readonly config: CloudflareForSaasConfig) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await (this.config.fetch ?? fetch)(`${this.config.baseUrl ?? "https://api.cloudflare.com/client/v4"}/zones/${encodeURIComponent(this.config.zoneId)}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${this.config.apiToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({})) as CloudflareEnvelope<T>;
    if (!response.ok || body.success === false || body.result === undefined) throw new CloudflareRequestError(response.status, body.errors ?? []);
    return body.result;
  }

  private async cnameTarget(): Promise<string> {
    if (this.config.cnameTarget) return this.config.cnameTarget;
    this.fallbackOrigin ??= this.request<{ origin?: string }>("/custom_hostnames/fallback_origin").then((result) => {
      if (!result.origin) throw new Error("The Cloudflare for SaaS zone has no fallback origin. Set one, or set PARTNER_DOMAIN_CNAME_TARGET.");
      return result.origin;
    });
    try {
      return await this.fallbackOrigin;
    } catch (error) {
      this.fallbackOrigin = null;
      throw error;
    }
  }

  async create(hostname: string): Promise<{ id: string }> {
    try {
      const created = await this.request<CloudflareCustomHostname>("/custom_hostnames", {
        method: "POST",
        body: JSON.stringify({ hostname, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } }),
      });
      return { id: created.id };
    } catch (error) {
      if (!(error instanceof CloudflareRequestError)) throw error;
      if (!error.errors.some((entry) => entry.code === DUPLICATE_HOSTNAME)) {
        if (REFUSED_HOSTNAME_STATUSES.has(error.status)) throw new CustomHostnameRefusedError(error.errors.flatMap((entry) => (entry.message ? [entry.message] : [])));
        throw error;
      }
      // An earlier run registered it and died before saving its id, or another partner's claim on the same domain did.
      const [existing] = await this.request<CloudflareCustomHostname[]>(`/custom_hostnames?hostname=${encodeURIComponent(hostname)}`);
      if (!existing) throw error;
      return { id: existing.id };
    }
  }

  async status(id: string): Promise<CustomHostnameStatus> {
    let hostname: CloudflareCustomHostname;
    try {
      hostname = await this.request<CloudflareCustomHostname>(`/custom_hostnames/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof CloudflareRequestError && error.status === 404) return { state: "failed", records: [], errors: ["Cloudflare no longer has this hostname. Remove the domain and add it again."] };
      throw error;
    }
    const hostnameState = hostname.status ?? "pending";
    const certificateState = hostname.ssl?.status ?? "initializing";
    const records: DnsRecord[] = [{ type: "CNAME", name: hostname.hostname, value: await this.cnameTarget(), verified: hostnameState === "active" }];
    for (const record of hostname.ssl?.validation_records ?? []) {
      if (record.txt_name && record.txt_value) records.push({ type: "TXT", name: record.txt_name, value: record.txt_value, verified: !UNVALIDATED_CERTIFICATE_STATES.has(certificateState) });
    }
    const errors = [...(hostname.verification_errors ?? []), ...(hostname.ssl?.validation_errors ?? []).flatMap((entry) => (entry.message ? [entry.message] : []))];
    const state = hostnameState === "active" && certificateState === "active" ? "active" : FAILED_HOSTNAME_STATES.has(hostnameState) || FAILED_CERTIFICATE_STATES.has(certificateState) ? "failed" : "pending";
    return { state, records, errors };
  }

  async remove(id: string): Promise<void> {
    try {
      await this.request(`/custom_hostnames/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (error) {
      if (error instanceof CloudflareRequestError && error.status === 404) return;
      throw error;
    }
  }
}

/** Looks up the addresses a hostname reaches, after any CNAME. An empty list when it has none. */
export type AddressLookup = (hostname: string) => Promise<string[]>;

const NO_ADDRESS_CODES = new Set(["ENOTFOUND", "ENODATA", "EAI_NONAME", "EAI_NODATA"]);

/** The system resolver's addresses for a hostname, as the deployment's own requests would reach it. */
export const systemAddressLookup: AddressLookup = async (hostname) => {
  try {
    return (await lookup(hostname, { all: true })).map((entry) => entry.address);
  } catch (error) {
    if (NO_ADDRESS_CODES.has((error as NodeJS.ErrnoException).code ?? "")) return [];
    throw error;
  }
};

/** Looks up the TXT records at a DNS name, each record's strings joined into one value. An empty list when the name has none. */
export type TxtLookup = (name: string) => Promise<string[]>;

/** A TxtLookup on a resolver, the system's by default, as the deployment's own requests would see the name. */
export function createTxtLookup(resolve: (name: string) => Promise<string[][]> = resolveTxt): TxtLookup {
  return async (name) => {
    try {
      return (await resolve(name)).map((chunks) => chunks.join(""));
    } catch (error) {
      if (NO_ADDRESS_CODES.has((error as NodeJS.ErrnoException).code ?? "")) return [];
      throw error;
    }
  };
}

export const systemTxtLookup: TxtLookup = createTxtLookup();

export type CaddyHostnamesConfig = {
  /** The hostname partners point their CNAME at: one that already reaches this deployment. */
  target: string;
  lookupAddresses?: AddressLookup;
};

/**
 * A self-hosted deployment's custom hostnames. Caddy issues each certificate
 * on demand, so there's nothing to register: a domain is active once every
 * address it reaches is one of the target's, which a CNAME to the target or
 * the same A and AAAA records gives.
 */
export class CaddyHostnames implements CustomHostnameProvider {
  readonly kind = "caddy" as const;

  constructor(private readonly config: CaddyHostnamesConfig) {}

  async create(hostname: string): Promise<{ id: string }> {
    return { id: hostname };
  }

  async status(id: string): Promise<CustomHostnameStatus> {
    const lookupAddresses = this.config.lookupAddresses ?? systemAddressLookup;
    const [domain, target] = await Promise.all([lookupAddresses(id), lookupAddresses(this.config.target)]);
    if (target.length === 0) throw new Error(`The custom domain target ${this.config.target} reaches no address, so no partner's domain can be checked against it.`);
    const pointsHere = domain.length > 0 && domain.every((address) => target.includes(address));
    return { state: pointsHere ? "active" : "pending", records: [{ type: "CNAME", name: id, value: this.config.target, verified: pointsHere }], errors: [] };
  }

  async remove(_id: string): Promise<void> {
    // Caddy keeps no list: once the domain is gone, /api/tls/ask refuses its renewals.
  }
}

function appHostname(env: Record<string, string | undefined>): string | null {
  try {
    return new URL(env.APP_BASE_URL?.trim() || "http://localhost").hostname;
  } catch {
    return null;
  }
}

/**
 * The provider partners' own domains go through on this deployment, as
 * partnerFeatures decides, or null when partners can't add one.
 * PARTNER_DOMAIN_CNAME_TARGET names the hostname partners point their CNAME
 * at: on Cloudflare it defaults to the zone's fallback origin, and with Caddy
 * to APP_BASE_URL's hostname.
 */
export function createCustomHostnameProvider(env: Record<string, string | undefined> = process.env): CustomHostnameProvider | null {
  const target = env.PARTNER_DOMAIN_CNAME_TARGET?.trim().toLowerCase().replace(/\.$/, "") || null;
  switch (partnerFeatures(env).customDomains) {
    case "cloudflare":
      return new CloudflareForSaas({ apiToken: env.CLOUDFLARE_SAAS_API_TOKEN!.trim(), zoneId: env.CLOUDFLARE_SAAS_ZONE_ID!.trim(), cnameTarget: target });
    case "caddy": {
      const caddyTarget = target ?? appHostname(env);
      return caddyTarget ? new CaddyHostnames({ target: caddyTarget }) : null;
    }
    default:
      return null;
  }
}
