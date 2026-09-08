import { Webhook } from "standardwebhooks";

export type PolarWebhookHeaders = {
  "webhook-id": string;
  "webhook-timestamp": string;
  "webhook-signature": string;
};

export function verifyPolarWebhookSignature(body: string, headers: PolarWebhookHeaders, secret: string): boolean {
  // Polar switched new secrets to Standard Webhooks on 2026-09-08.
  // Older endpoints sign with the literal UTF-8 secret, so retain both formats.
  for (const key of [secret, Buffer.from(secret, "utf8").toString("base64")]) {
    try {
      new Webhook(key).verify(body, headers);
      return true;
    } catch {
      // Try the legacy signing key without relaxing timestamp/body validation.
    }
  }
  return false;
}
