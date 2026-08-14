import { describe, expect, it } from "vitest";

import { classifySmsConsentUpdate, classifySmsKeywordReply, normalizeSmsKeyword } from "./sms";

describe("SMS consent classifiers", () => {
  it("normalizes keywords to alphanumeric uppercase", () => {
    expect(normalizeSmsKeyword("  stop! ")).toBe("STOP");
    expect(normalizeSmsKeyword("unsubscribe")).toBe("UNSUBSCRIBE");
  });

  it("classifies Twilio opt-out types with source precedence", () => {
    expect(classifySmsConsentUpdate({ body: "irrelevant", optOutType: "STOP" })).toEqual({ status: "opted_out", source: "twilio_opt_out:STOP" });
    expect(classifySmsConsentUpdate({ body: "irrelevant", optOutType: "START" })).toEqual({ status: "subscribed", source: "twilio_opt_out:START" });
  });

  it("classifies STOP and START keyword bodies", () => {
    expect(classifySmsConsentUpdate({ body: "stop" })).toEqual({ status: "opted_out", source: "keyword:STOP" });
    expect(classifySmsConsentUpdate({ body: "start" })).toEqual({ status: "subscribed", source: "keyword:START" });
    expect(classifySmsConsentUpdate({ body: "Yes please" })).toBeNull();
  });

  it("returns compliance replies only for HELP and START", () => {
    expect(classifySmsKeywordReply({ body: "help" })?.kind).toBe("help");
    expect(classifySmsKeywordReply({ body: "start" })?.kind).toBe("start");
    expect(classifySmsKeywordReply({ body: "stop" })).toBeNull();
    expect(classifySmsKeywordReply({ body: "hello" })).toBeNull();
  });
});
