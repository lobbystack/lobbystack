import { describe, expect, it } from "vitest";

import { parseAttachRequest, providerSeconds } from "./liveCalls";

describe("providerSeconds", () => {
  it("uses the seconds OpenAI reported", () => {
    expect(providerSeconds({ billedSeconds: 42, durationMs: 41_000 }, "web_voice")).toBe(42);
    expect(providerSeconds({ billedSeconds: 15, durationMs: 800 }, "web_voice")).toBe(15);
  });

  it("assumes OpenAI's 15-second WebRTC minimum when the report never arrived", () => {
    expect(providerSeconds({ durationMs: 5_472 }, "web_voice")).toBe(15);
    expect(providerSeconds({ durationMs: 90_000 }, "web_voice")).toBe(90);
  });

  it("uses the measured length for a phone call without a report", () => {
    expect(providerSeconds({ durationMs: 5_472 }, "voice")).toBe(5.472);
  });
});

describe("parseAttachRequest", () => {
  it("keeps only the fields the worker trusts", () => {
    expect(parseAttachRequest(JSON.stringify({ sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "web_voice", intakeOnly: "yes", maxDurationMs: -1 })))
      .toEqual({ sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "web_voice" });
  });
});
