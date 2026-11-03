import { createHmac } from "node:crypto";

import { signPayload, verifySignedPayload } from "@lobbystack/providers/crypto/signedPayload";

/** The dashboard's auth secret, which signs OAuth states and connect links. */
export function oauthSigningSecret(): string {
  return process.env.BETTER_AUTH_SECRET ?? process.env.INTERNAL_SERVICE_SECRET ?? "";
}

/** A v1 token carrying `payload`, signed under `domain`, such as "google-calendar:state". Throws `unconfigured` when there is no secret. */
export function signOAuthPayload(domain: string, payload: Record<string, unknown>, unconfigured: string): string {
  if (!oauthSigningSecret()) throw new Error(unconfigured);
  return signPayload(oauthSigningSecret(), domain, payload);
}

/** The payload of a v1 token signed under `domain`, or null. */
export function verifyOAuthPayload(domain: string, value: string): Record<string, unknown> | null {
  return verifySignedPayload(oauthSigningSecret(), domain, value);
}

/** A fresh nonce, and an issue time within the lifetime and not ahead of the clock by more than 30 seconds. */
export function oauthPayloadCurrent(payload: Record<string, unknown>, lifetimeMs: number): boolean {
  const { nonce, issuedAt } = payload;
  return typeof nonce === "string" && /^[a-f0-9-]{36}$/i.test(nonce) && typeof issuedAt === "number" && Number.isFinite(issuedAt) && Date.now() - issuedAt <= lifetimeMs && issuedAt <= Date.now() + 30_000;
}

/**
 * Whether a state's `origin`, the partner's host a connection started on, is
 * absent, as on the host's domain, or a plain http or https origin.
 */
export function oauthStartOriginValid(origin: unknown): origin is string | undefined {
  if (origin === undefined) return true;
  if (typeof origin !== "string") return false;
  try {
    const url = new URL(origin);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === origin;
  } catch {
    return false;
  }
}

/** Keyed digest of an OAuth state under `prefix`: a lookup value stored in place of the bearer state, or a PKCE verifier. */
export function keyedStateDigest(prefix: string, state: string, unconfigured: string): string {
  if (!oauthSigningSecret()) throw new Error(unconfigured);
  return createHmac("sha256", oauthSigningSecret()).update(`${prefix}:lookup:${state}`).digest("hex");
}
