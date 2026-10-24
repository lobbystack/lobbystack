import { createHmac, timingSafeEqual } from "node:crypto";

/** The dashboard's auth secret, which signs OAuth states and connect links. */
export function oauthSigningSecret(): string {
  return process.env.BETTER_AUTH_SECRET ?? process.env.INTERNAL_SERVICE_SECRET ?? "";
}

// Each integration and kind of token signs under its own domain, such as
// "google-calendar:state", so a token of one kind never passes as another.
function sign(domain: string, value: string): string {
  return createHmac("sha256", oauthSigningSecret()).update(`${domain}:${value}`).digest("base64url");
}

/** A v1 token carrying `payload`, signed under `domain`. Throws `unconfigured` when there is no secret. */
export function signOAuthPayload(domain: string, payload: Record<string, unknown>, unconfigured: string): string {
  if (!oauthSigningSecret()) throw new Error(unconfigured);
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `v1.${encoded}.${sign(domain, `v1.${encoded}`)}`;
}

/** The payload of a v1 token signed under `domain`, or null. */
export function verifyOAuthPayload(domain: string, value: string): Record<string, unknown> | null {
  if (value.length > 2048) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [version, encoded, signature] = parts;
  if (version !== "v1" || !encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || !oauthSigningSecret()) return null;
  const expected = sign(domain, `${version}.${encoded}`);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** A fresh nonce, and an issue time within the lifetime and not ahead of the clock by more than 30 seconds. */
export function oauthPayloadCurrent(payload: Record<string, unknown>, lifetimeMs: number): boolean {
  const { nonce, issuedAt } = payload;
  return typeof nonce === "string" && /^[a-f0-9-]{36}$/i.test(nonce) && typeof issuedAt === "number" && Number.isFinite(issuedAt) && Date.now() - issuedAt <= lifetimeMs && issuedAt <= Date.now() + 30_000;
}

/** Lookup digest of an OAuth state under `prefix`, so only the digest is stored, never the bearer value. */
export function oauthStateDigest(prefix: string, state: string, unconfigured: string): string {
  if (!oauthSigningSecret()) throw new Error(unconfigured);
  return createHmac("sha256", oauthSigningSecret()).update(`${prefix}:lookup:${state}`).digest("hex");
}
