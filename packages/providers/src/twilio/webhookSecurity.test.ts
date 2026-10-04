import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { resolveTwilioWebhookUrl, validateTwilioSignature } from "./webhookSecurity";

function sign(url: string, params: Record<string, string>): string {
  const payload = `${url}${Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("")}`;
  return createHmac("sha1", "auth-token").update(payload, "utf8").digest("base64");
}

describe("twilio webhook security", () => {
  it("validates signed requests and rejects tampered or missing signatures", () => {
    const url = "https://example.com/twilio/sms/inbound";
    const params = { Body: "Hello", From: "+14165550123", To: "+14165550000" };
    const signature = sign(url, params);

    expect(validateTwilioSignature({ authToken: "auth-token", signatureHeader: signature, url, params })).toBe(true);
    expect(validateTwilioSignature({ authToken: "auth-token", signatureHeader: `${signature}tampered`, url, params })).toBe(false);
    expect(validateTwilioSignature({ authToken: "auth-token", signatureHeader: signature, url, params: { ...params, Body: "Changed" } })).toBe(false);
    expect(validateTwilioSignature({ authToken: "auth-token", signatureHeader: null, url, params })).toBe(false);
    expect(validateTwilioSignature({ authToken: undefined, signatureHeader: signature, url, params })).toBe(false);
  });

  it("validates public callbacks behind a proxy without dropping or trusting unsigned query values", () => {
    const endpoint = "https://staging.example.com/api/webhooks/twilio/status";
    const query = "?notificationId=abc&label=a%2Fb+test";
    const params = { MessageSid: "SMtest", MessageStatus: "delivered" };
    const signature = sign(`${endpoint}${query}`, params);
    const url = resolveTwilioWebhookUrl(`http://internal:3000/api/webhooks/twilio/status${query}`, endpoint);
    expect(url).toBe(endpoint + query);
    expect(validateTwilioSignature({ authToken: "auth-token", signatureHeader: signature, url, params })).toBe(true);
    const tampered = resolveTwilioWebhookUrl("http://internal:3000/api/webhooks/twilio/status?notificationId=other", endpoint);
    expect(validateTwilioSignature({ authToken: "auth-token", signatureHeader: signature, url: tampered, params })).toBe(false);
    expect(resolveTwilioWebhookUrl(endpoint, endpoint + "?notificationId=abc")).toBe(endpoint);
    expect(resolveTwilioWebhookUrl(endpoint + query)).toBe(endpoint + query);
  });
});
