import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import { telnyxUrlSecretMatches, validateTelnyxSignature } from "./webhookSecurity";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
// The portal shows the raw 32-byte key in base64: the last 32 bytes of its SPKI encoding.
const portalKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
const now = new Date("2026-10-29T12:00:00Z");
const timestamp = String(Math.floor(now.getTime() / 1000));
const body = JSON.stringify({ data: { event_type: "message.received", payload: { id: "m1" } } });
const signed = (ts: string, raw: string) => sign(null, Buffer.from(`${ts}|${raw}`), privateKey).toString("base64");

describe("validateTelnyxSignature", () => {
  it("accepts Telnyx's Ed25519 signature over the timestamp and raw body", () => {
    expect(validateTelnyxSignature({ publicKey: portalKey, signatureHeader: signed(timestamp, body), timestampHeader: timestamp, rawBody: body, now })).toBe(true);
  });

  it("refuses a changed body, a moved timestamp, an old signature and a missing key", () => {
    const signature = signed(timestamp, body);
    expect(validateTelnyxSignature({ publicKey: portalKey, signatureHeader: signature, timestampHeader: timestamp, rawBody: `${body} `, now })).toBe(false);
    expect(validateTelnyxSignature({ publicKey: portalKey, signatureHeader: signature, timestampHeader: String(Number(timestamp) + 1), rawBody: body, now })).toBe(false);
    const old = String(Number(timestamp) - 301);
    expect(validateTelnyxSignature({ publicKey: portalKey, signatureHeader: signed(old, body), timestampHeader: old, rawBody: body, now })).toBe(false);
    expect(validateTelnyxSignature({ publicKey: undefined, signatureHeader: signature, timestampHeader: timestamp, rawBody: body, now })).toBe(false);
    expect(validateTelnyxSignature({ publicKey: "bm90IGEga2V5", signatureHeader: signature, timestampHeader: timestamp, rawBody: body, now })).toBe(false);
    expect(validateTelnyxSignature({ publicKey: portalKey, signatureHeader: "garbage", timestampHeader: timestamp, rawBody: body, now })).toBe(false);
  });

  it("compares a URL secret in constant time", () => {
    expect(telnyxUrlSecretMatches("s3cret", "s3cret")).toBe(true);
    expect(telnyxUrlSecretMatches("s3cret", "s3cre")).toBe(false);
    expect(telnyxUrlSecretMatches(undefined, "x")).toBe(false);
  });
});
