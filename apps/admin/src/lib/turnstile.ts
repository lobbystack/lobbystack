import { headers } from "next/headers";

import { partnerRequestOrigin } from "./request-brand";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
  "error-codes"?: string[];
  /** The hostname of the page the challenge was solved on. */
  hostname?: string;
};

/**
 * On a partner's host, the hostname the proxy resolved the request on, which
 * the challenge must have been solved on too. Null on the host's domain, and
 * outside a request.
 */
async function partnerHostname(): Promise<string | null> {
  try {
    const origin = partnerRequestOrigin(await headers());
    return origin ? new URL(origin).hostname : null;
  } catch {
    return null;
  }
}

function isLocalApp(): boolean {
  const baseUrl = process.env.APP_BASE_URL?.trim();
  return Boolean(baseUrl?.startsWith("http://localhost:") || baseUrl?.startsWith("http://127.0.0.1:"));
}

export async function verifyTurnstile(input: { token?: unknown; remoteIp?: string | null }): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (isLocalApp()) return;
    throw new Error("Turnstile is not configured.");
  }
  const token = typeof input.token === "string" && input.token.trim() ? input.token.trim() : undefined;
  if (!token) {
    throw new Error("Turnstile verification is required.");
  }
  const body = new URLSearchParams({ secret, response: token });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);
  let response: Response;
  try {
    response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error("Turnstile verification failed.");
  }
  if (!response.ok) {
    throw new Error("Turnstile verification failed.");
  }
  const outcome = (await response.json()) as TurnstileResponse;
  if (outcome.success !== true) {
    throw new Error("Turnstile verification failed.");
  }
  // The widget's hostname list covers every partner's subdomain, so a token
  // solved on one partner's host counts only on that same host.
  const expected = await partnerHostname();
  if (expected && outcome.hostname?.toLowerCase() !== expected) {
    throw new Error("Turnstile verification failed.");
  }
}
