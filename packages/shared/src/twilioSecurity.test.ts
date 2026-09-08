import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  computeTwilioSignature,
  resolveTwilioWebhookUrl,
  escapeXmlText,
  validateTwilioSignature,
} from "./twilioSecurity";

describe("twilio security helpers", () => {
  it("computes the same signature as Twilio's HMAC-SHA1 scheme", async () => {
    const url = "https://example.com/twilio/sms/inbound";
    const params = {
      Body: "Hello",
      From: "+14165550123",
      To: "+14165550000",
    };

    const expected = createHmac("sha1", "auth-token")
      .update(
        `${url}${Object.keys(params)
          .sort()
          .map((key) => `${key}${params[key as keyof typeof params]}`)
          .join("")}`,
        "utf8",
      )
      .digest("base64");

    await expect(
      computeTwilioSignature({
        authToken: "auth-token",
        url,
        params,
      }),
    ).resolves.toBe(expected);
  });

  it("validates signed requests and rejects tampered signatures", async () => {
    const url = "https://example.com/twilio/sms/inbound";
    const params = {
      Body: "Hello",
      From: "+14165550123",
      To: "+14165550000",
    };

    const signature = await computeTwilioSignature({
      authToken: "auth-token",
      url,
      params,
    });

    await expect(
      validateTwilioSignature({
        authToken: "auth-token",
        signatureHeader: signature,
        url,
        params,
      }),
    ).resolves.toBe(true);

    await expect(
      validateTwilioSignature({
        authToken: "auth-token",
        signatureHeader: `${signature}tampered`,
        url,
        params,
      }),
    ).resolves.toBe(false);
  });

  it("validates public callbacks behind a proxy without dropping or trusting unsigned query values", async () => {
    const endpoint = "https://staging.example.com/api/webhooks/twilio/status";
    const query = "?notificationId=abc&label=a%2Fb+test";
    const params = { MessageSid: "SMtest", MessageStatus: "delivered" };
    const signature = createHmac("sha1", "auth-token")
      .update(`${endpoint}${query}MessageSidSMtestMessageStatusdelivered`).digest("base64");
    const url = resolveTwilioWebhookUrl(`http://internal:3000/api/webhooks/twilio/status${query}`, endpoint);
    expect(url).toBe(endpoint + query);
    await expect(validateTwilioSignature({ authToken: "auth-token", signatureHeader: signature, url, params })).resolves.toBe(true);
    const tampered = resolveTwilioWebhookUrl("http://internal:3000/api/webhooks/twilio/status?notificationId=other", endpoint);
    await expect(validateTwilioSignature({ authToken: "auth-token", signatureHeader: signature, url: tampered, params })).resolves.toBe(false);
    expect(resolveTwilioWebhookUrl(endpoint, endpoint + "?notificationId=abc")).toBe(endpoint);
    expect(resolveTwilioWebhookUrl(endpoint + query)).toBe(endpoint + query);
  });

  it("escapes XML-sensitive characters for TwiML text nodes", () => {
    expect(escapeXmlText(`5 < 6 & "quoted" 'single'`)).toBe(
      "5 &lt; 6 &amp; &quot;quoted&quot; &apos;single&apos;",
    );
  });
});
