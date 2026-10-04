import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";

import { isBlockedAddress } from "@lobbystack/providers/crawling/urlSafety";

import { invalidRequest } from "./errors";

// Outbound webhooks go to customer-chosen URLs, so every send must refuse
// addresses inside our own network. This applies to cloud and self-hosted
// deployments alike. The check runs when an endpoint is saved and again on
// every send against the addresses DNS returns, and the connection is made to
// the address that was checked, so a DNS answer cannot change in between.

export type WebhookUrlPolicy = { allowHttp: boolean };

export function webhookUrlPolicy(environment: Readonly<Record<string, string | undefined>> = process.env): WebhookUrlPolicy {
  return { allowHttp: environment.NODE_ENV === "development" };
}

const blockedHostnames = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /^metadata$/i, /^metadata\.google\.internal$/i];

/** Validates a URL before it is saved. Throws a 400 invalid_request error with a reason. */
export function assertWebhookUrlAllowed(value: string, policy: WebhookUrlPolicy = webhookUrlPolicy()): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidRequest("url must be an absolute URL.");
  }
  if (url.protocol !== "https:" && !(policy.allowHttp && url.protocol === "http:")) throw invalidRequest(policy.allowHttp ? "url must use https or http." : "url must use https.");
  if (url.username || url.password) throw invalidRequest("url must not contain a username or password.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || blockedHostnames.some((pattern) => pattern.test(hostname))) throw invalidRequest("url must point to a public host.");
  if (isIP(hostname) && isBlockedAddress(hostname)) throw invalidRequest("url must point to a public IP address.");
  return url;
}

export class BlockedAddressError extends Error {
  constructor(hostname: string) {
    super(`${hostname} resolves to a private or reserved address.`);
    this.name = "BlockedAddressError";
  }
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * A drop-in `lookup` for http.request that resolves every address for the
 * host and refuses the connection when any of them is blocked.
 */
export function createGuardedLookup(resolve: typeof dnsLookup = dnsLookup) {
  return (hostname: string, options: { all?: boolean; family?: number | string } | number, callback: LookupCallback): void => {
    resolve(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error, []);
      const list = (addresses as unknown as LookupAddress[]) ?? [];
      if (list.length === 0 || list.some((entry) => isBlockedAddress(entry.address))) return callback(new BlockedAddressError(hostname), []);
      const wantsAll = typeof options === "object" && options.all === true;
      if (wantsAll) return callback(null, list);
      const first = list[0]!;
      callback(null, first.address, first.family);
    });
  };
}
