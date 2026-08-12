import { Webhook } from "standardwebhooks";

export type PolarWebhookHeaders = {
  "webhook-id": string;
  "webhook-timestamp": string;
  "webhook-signature": string;
};

export function verifyPolarWebhookSignature(body: string, headers: PolarWebhookHeaders, secret: string): boolean {
  try {
    const base64Secret = Buffer.from(secret, "utf8").toString("base64");
    new Webhook(base64Secret).verify(body, headers);
    return true;
  } catch {
    return false;
  }
}
