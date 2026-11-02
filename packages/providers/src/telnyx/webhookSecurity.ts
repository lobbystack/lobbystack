import { createPublicKey, timingSafeEqual, verify, type KeyObject } from "node:crypto";

/** Telnyx's own SDK allows five minutes between the signed timestamp and now. */
export const TELNYX_SIGNATURE_TOLERANCE_SECONDS = 300;

// DER prefix that wraps a raw 32-byte Ed25519 key as SubjectPublicKeyInfo.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function publicKey(base64: string): KeyObject | null {
  const raw = Buffer.from(base64.trim(), "base64");
  if (raw.length !== 32) return null;
  return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
}

/**
 * Checks a Telnyx webhook: an Ed25519 signature, from the account's public
 * key, over `${telnyx-timestamp}|${raw body}`, signed within the last five
 * minutes. The raw body must be the bytes Telnyx sent, before any parsing.
 */
export function validateTelnyxSignature(input: {
  publicKey: string | null | undefined;
  signatureHeader: string | null | undefined;
  timestampHeader: string | null | undefined;
  rawBody: string;
  now?: Date;
}): boolean {
  if (!input.publicKey || !input.signatureHeader || !input.timestampHeader || !/^\d+$/.test(input.timestampHeader)) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - Number(input.timestampHeader)) > TELNYX_SIGNATURE_TOLERANCE_SECONDS) return false;
  try {
    const key = publicKey(input.publicKey);
    const signature = Buffer.from(input.signatureHeader, "base64");
    if (!key || signature.length !== 64) return false;
    return verify(null, Buffer.from(`${input.timestampHeader}|${input.rawBody}`), key, signature);
  } catch {
    return false;
  }
}

/** Compares a secret passed in a webhook URL, for the TeXML fetch that may come unsigned. */
export function telnyxUrlSecretMatches(expected: string | null | undefined, actual: string | null | undefined): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected); const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
