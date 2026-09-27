import https from "node:https";

import { assertWebhookUrlAllowed, createGuardedLookup } from "../publicApi/webhookNetwork";

// Client ID Metadata Documents: an MCP client names itself with an HTTPS URL
// and the authorization server fetches its metadata from there. That makes
// the client_id an attacker-chosen URL, so the fetch gets the same network
// rules as outbound webhooks: HTTPS only, public hosts only, every DNS answer
// checked and the connection pinned to the checked address, no redirects, a
// short timeout and a small body limit. The CIMD plugin adds its own 5 KB
// limit, JSON content-type check, cache (bounded entries and freshness) and
// per-origin fetch budgets on top.

export const CIMD_MAX_RESPONSE_BYTES = 5 * 1024;
export const CIMD_TIMEOUT_MS = 5_000;

/** True when a client_id URL may be fetched at all: HTTPS, no credentials, not a private or reserved host. */
export function isCimdUrlAllowed(value: string): boolean {
  try {
    const url = assertWebhookUrlAllowed(value, { allowHttp: false });
    return url.protocol === "https:" && !url.hash && url.pathname !== "/" && url.pathname !== "";
  } catch {
    return false;
  }
}

export type CimdFetchOptions = {
  lookup?: ReturnType<typeof createGuardedLookup>;
  timeoutMs?: number;
  maxBytes?: number;
  /** Test seam: the request function to use instead of node:https. */
  request?: typeof https.request;
};

/**
 * A fetch for CIMD metadata resources with webhook-grade SSRF protection.
 * Redirect responses come back as they are and are never followed.
 */
export function createCimdFetch(options: CimdFetchOptions = {}): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const lookup = options.lookup ?? createGuardedLookup();
  const timeoutMs = options.timeoutMs ?? CIMD_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? CIMD_MAX_RESPONSE_BYTES;
  const send = options.request ?? https.request;
  return async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "GET" && request.method !== "HEAD") throw new TypeError("CIMD fetches use GET or HEAD only.");
    if (!isCimdUrlAllowed(request.url)) throw new TypeError("The client_id URL must be an HTTPS URL on a public host.");
    const url = new URL(request.url);
    const headers: Record<string, string> = { "user-agent": "LobbyStack-OAuth/1.0" };
    request.headers.forEach((value, name) => { headers[name] = value; });
    return await new Promise<Response>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };
      const outgoing = send(url, { method: request.method, headers, lookup: lookup as never, agent: false }, (response) => {
        const chunks: Buffer[] = [];
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            response.destroy();
            fail(new TypeError(`The metadata document is larger than ${maxBytes} bytes.`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item);
            else if (value !== undefined) responseHeaders.set(name, value);
          }
          const status = response.statusCode ?? 502;
          const body = request.method === "HEAD" || [204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
          resolve(new Response(body, { status, headers: responseHeaders }));
        });
        response.on("error", (error) => fail(error));
      });
      const timer = setTimeout(() => {
        outgoing.destroy();
        fail(new TypeError(`The metadata document fetch timed out after ${timeoutMs} ms.`));
      }, timeoutMs);
      request.signal.addEventListener("abort", () => {
        outgoing.destroy();
        fail(new TypeError("The metadata document fetch was aborted."));
      }, { once: true });
      outgoing.on("error", (error) => fail(error));
      outgoing.end();
    });
  };
}
