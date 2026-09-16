import { createHmac, timingSafeEqual } from "node:crypto";

export type ResendWebhookHeaders = { id: string; timestamp: string; signature: string };

export function verifyResendWebhookSignature(body: string, headers: ResendWebhookHeaders, secret: string, now = Date.now()): boolean {
  const timestamp = Number(headers.timestamp);
  if (!headers.id || !Number.isFinite(timestamp) || Math.abs(now - timestamp * 1_000) > 5 * 60_000) return false;
  const rawSecret = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try { key = Buffer.from(rawSecret, "base64"); } catch { return false; }
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest("base64");
  return headers.signature.split(" ").some((candidate) => {
    const value = candidate.replace(/^v\d+,/, "");
    const actual = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  });
}
