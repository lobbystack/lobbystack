import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildTwilioRequestUrl,
  normalizeFormFields,
  validateTwilioSignature,
} from "./twilioRequest";

function computeSignature(url: string, authToken: string, params?: Record<string, string>): string {
  const signedPayload = `${url}${Object.keys(params ?? {})
    .sort()
    .map((key) => `${key}${(params ?? {})[key]}`)
    .join("")}`;
  return createHmac("sha1", authToken).update(signedPayload, "utf8").digest("base64");
}

describe("twilioRequest helpers", () => {
  it("normalizes Fastify form payloads into string records", () => {
    expect(
      normalizeFormFields({
        CallSid: "CA123",
        SequenceNumber: 7,
        IsLive: true,
        Ignored: { nested: true },
      }),
    ).toEqual({
      CallSid: "CA123",
      SequenceNumber: "7",
      IsLive: "true",
    });
  });

  it("validates form-encoded request signatures", () => {
    const url = "https://voice.example.com/twilio/voice/inbound";
    const params = {
      CallSid: "CA123",
      From: "+15551234567",
      To: "+15557654321",
    };
    const signature = computeSignature(url, "token123", params);

    expect(
      validateTwilioSignature({
        authToken: "token123",
        signatureHeader: signature,
        url,
        params,
      }),
    ).toBe(true);
  });

  it("validates websocket signatures against the exact public URL", () => {
    const url = buildTwilioRequestUrl("https://voice.example.com", "/media-stream");
    const signature = computeSignature(url, "token123");

    expect(
      validateTwilioSignature({
        authToken: "token123",
        signatureHeader: signature,
        url,
      }),
    ).toBe(true);
  });

  it("rejects requests when no auth token is configured", () => {
    expect(
      validateTwilioSignature({
        authToken: undefined,
        url: "https://voice.example.com/media-stream",
        signatureHeader: undefined,
      }),
    ).toBe(false);
  });
});
