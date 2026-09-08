import { describe, expect, it } from "vitest";
import { Webhook } from "standardwebhooks";

import { verifyPolarWebhookSignature } from "./webhook";

describe("Polar webhook signatures", () => {
  it("accepts new Standard Webhooks secrets directly", () => {
    const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
    const body = JSON.stringify({ type: "subscription.active", data: {} });
    const timestamp = new Date();
    const headers = {
      "webhook-id": "msg_new",
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": new Webhook(secret).sign("msg_new", timestamp, body),
    };
    expect(verifyPolarWebhookSignature(body, headers, secret)).toBe(true);
    expect(verifyPolarWebhookSignature(`${body} `, headers, secret)).toBe(false);
  });
  it("accepts Standard Webhooks signatures and rejects tampered payloads", () => {
    const secret = "polar-test-secret";
    const body = JSON.stringify({ id: "event-1", type: "order.created", data: {} });
    const id = "msg_123";
    const timestamp = new Date();
    const signature = new Webhook(Buffer.from(secret, "utf8").toString("base64")).sign(id, timestamp, body);
    const headers = {
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": signature,
    };

    expect(verifyPolarWebhookSignature(body, headers, secret)).toBe(true);
    expect(verifyPolarWebhookSignature(`${body} `, headers, secret)).toBe(false);
  });
});
