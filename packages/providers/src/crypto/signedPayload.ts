import { createHmac, timingSafeEqual } from "node:crypto";

// Each kind of token signs under its own domain, such as
// "google-calendar:state", so a token of one kind never passes as another.
function sign(secret: string, domain: string, value: string): string {
  return createHmac("sha256", secret).update(`${domain}:${value}`).digest("base64url");
}

/** A v1 token carrying `payload`, signed under `domain`. */
export function signPayload(secret: string, domain: string, payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `v1.${encoded}.${sign(secret, domain, `v1.${encoded}`)}`;
}

/** The payload of a v1 token signed under `domain`, or null. */
export function verifySignedPayload(secret: string, domain: string, value: string): Record<string, unknown> | null {
  if (value.length > 2048) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [version, encoded, signature] = parts;
  if (version !== "v1" || !encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || !secret) return null;
  const expected = sign(secret, domain, `${version}.${encoded}`);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
