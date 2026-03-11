import { describe, expect, it } from "vitest";

import {
  isTerminalTwilioCallStatus,
  normalizeTwilioCallStatusPayload,
} from "./callStatus";

describe("callStatus helpers", () => {
  it("normalizes Twilio callback payloads", () => {
    expect(
      normalizeTwilioCallStatusPayload({
        CallSid: "CA123",
        CallStatus: "Completed",
        SequenceNumber: "7",
        CallbackSource: "call-progress-events",
        Timestamp: "Tue, 10 Mar 2026 20:00:00 +0000",
        CallDuration: "42",
      }),
    ).toEqual({
      callSid: "CA123",
      callStatus: "completed",
      sequenceNumber: 7,
      callbackSource: "call-progress-events",
      timestamp: "Tue, 10 Mar 2026 20:00:00 +0000",
      durationSeconds: 42,
    });
  });

  it("returns null when required fields are missing", () => {
    expect(
      normalizeTwilioCallStatusPayload({
        SequenceNumber: "3",
      }),
    ).toBeNull();
  });

  it("recognizes terminal Twilio statuses", () => {
    expect(isTerminalTwilioCallStatus("completed")).toBe(true);
    expect(isTerminalTwilioCallStatus("busy")).toBe(true);
    expect(isTerminalTwilioCallStatus("ringing")).toBe(false);
  });
});
