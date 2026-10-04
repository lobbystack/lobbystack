import { Webhook } from "standardwebhooks";

export type ResendWebhookHeaders = { id: string; timestamp: string; signature: string };

// Resend signs with Svix, which is Standard Webhooks under svix-* header names.
export function verifyResendWebhookSignature(body: string, headers: ResendWebhookHeaders, secret: string): boolean {
  try {
    new Webhook(secret).verify(body, {
      "webhook-id": headers.id,
      "webhook-timestamp": headers.timestamp,
      "webhook-signature": headers.signature,
    });
    return true;
  } catch {
    return false;
  }
}
