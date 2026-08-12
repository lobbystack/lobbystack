import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyResendWebhookSignature } from "./webhook";

describe("Resend webhook signatures", () => {
  it("accepts a current Svix-style signature and rejects replay or tampering", () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "email-1" } });
    const secret = `whsec_${Buffer.from("resend-secret").toString("base64")}`;
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const id = "msg-1";
    const signature = createHmac("sha256", Buffer.from("resend-secret")).update(`${id}.${timestamp}.${body}`).digest("base64");
    const headers = { id, timestamp, signature: `v1,${signature}` };

    expect(verifyResendWebhookSignature(body, headers, secret)).toBe(true);
    expect(verifyResendWebhookSignature(`${body}.`, headers, secret)).toBe(false);
    expect(verifyResendWebhookSignature(body, { ...headers, timestamp: String(Number(timestamp) - 601) }, secret)).toBe(false);
  });
});
