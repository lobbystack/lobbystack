import { describe, expect, it } from "vitest";

import { TelnyxApiError } from "./telnyxClient";
import { parseTelnyxMessagingWebhook, parseTelnyxTexmlCall, permanentTelnyxSmsErrorCode, telnyxDeliveryStatus } from "./webhooks";

const event = (eventType: string, payload: Record<string, unknown>) => ({ data: { event_type: eventType, id: "evt_1", occurred_at: "2026-10-29T12:00:00Z", payload, record_type: "event" }, meta: { attempt: 1 } });

describe("parseTelnyxMessagingWebhook", () => {
  it("maps an inbound text, with Telnyx's opt-out keyword", () => {
    expect(parseTelnyxMessagingWebhook(event("message.received", { id: "m1", direction: "inbound", from: { phone_number: "+14165550134" }, to: [{ phone_number: "+12125550100", status: "webhook_delivered" }], text: "STOP", media: [], autoresponse_type: "stop" })))
      .toEqual({ kind: "sms.received", providerMessageId: "m1", from: "+14165550134", to: "+12125550100", body: "STOP", numMedia: 0, optOutType: "STOP" });
    // HELP isn't a consent change, so it reaches the domain as plain text.
    expect(parseTelnyxMessagingWebhook(event("message.received", { id: "m2", from: { phone_number: "+14165550134" }, to: [{ phone_number: "+12125550100" }], text: "help", autoresponse_type: "HELP" }))).not.toHaveProperty("optOutType");
  });

  it("maps a final status with its price and segments", () => {
    expect(parseTelnyxMessagingWebhook(event("message.finalized", { id: "m3", from: { phone_number: "+12125550100" }, to: [{ phone_number: "+14165550134", status: "delivered" }], parts: 2, cost: { amount: "0.0080", currency: "USD" }, completed_at: "2026-10-29T12:00:05Z" })))
      .toEqual({ kind: "sms.status", providerMessageId: "m3", status: "delivered", from: "+12125550100", providerUpdatedAt: "2026-10-29T12:00:05.000Z", providerPrice: 0.008, providerPriceUnit: "usd", providerCostUsd: 0.008, providerNumSegments: 2 });
    // Before Telnyx prices the text, the segment count isn't final either.
    expect(parseTelnyxMessagingWebhook(event("message.sent", { id: "m4", to: [{ phone_number: "+14165550134", status: "sent" }], parts: 1, cost: null }))).toEqual({ kind: "sms.status", providerMessageId: "m4", status: "sent" });
  });

  it("ignores other events and payloads without an id", () => {
    expect(parseTelnyxMessagingWebhook(event("call.initiated", { id: "c1" }))).toBeNull();
    expect(parseTelnyxMessagingWebhook(event("message.received", { from: { phone_number: "+14165550134" } }))).toBeNull();
    expect(parseTelnyxMessagingWebhook(null)).toBeNull();
  });

  it("maps Telnyx statuses to the domain's", () => {
    expect(["queued", "sending", "sent", "delivery_unconfirmed", "delivered", "read", "delivery_failed", "expired", "sending_failed", "mystery"].map(telnyxDeliveryStatus))
      .toEqual(["queued", "sending", "sent", "sent", "delivered", "delivered", "undelivered", "undelivered", "failed", "queued"]);
  });
});

describe("parseTelnyxTexmlCall", () => {
  it("reads the dialled number from To, then the SIP URI", () => {
    expect(parseTelnyxTexmlCall({ To: "+12125550100", ToSipUri: "+12125550100@sip.telnyx.com", From: "+14165550134", CallSid: "c1" })).toEqual({ dialled: ["+12125550100"], from: "+14165550134" });
    expect(parseTelnyxTexmlCall({ To: "proj_abc", ToSipUri: "sip:+12125550100@sip.telnyx.com" })).toEqual({ dialled: ["+12125550100"] });
  });
});

describe("permanentTelnyxSmsErrorCode", () => {
  it("names the errors a retry can't fix", () => {
    expect(permanentTelnyxSmsErrorCode(new TelnyxApiError(422, [{ code: "40300", title: "Blocked due to STOP message" }], "/messages"))).toBe("40300");
    expect(permanentTelnyxSmsErrorCode(new TelnyxApiError(503, [{ code: "40006" }], "/messages"))).toBeUndefined();
    expect(permanentTelnyxSmsErrorCode(new Error("socket hang up"))).toBeUndefined();
  });
});
