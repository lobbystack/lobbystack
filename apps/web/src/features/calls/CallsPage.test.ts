import { describe, expect, it } from "vitest";

import {
  formatCallDispositionSummary,
  getCallRecordingAvailability,
} from "@/features/calls/CallsPage";

const t = ((key: string) => key) as Parameters<
  typeof formatCallDispositionSummary
>[1];

describe("formatCallDispositionSummary", () => {
  it("renders blocked contact call dispositions as blocked outcomes", () => {
    expect(formatCallDispositionSummary("contact_blocked", t)).toBe(
      "outcome.contactBlocked",
    );
  });

  it("renders abuse call dispositions as abuse outcomes", () => {
    expect(formatCallDispositionSummary("abuse_ended", t)).toBe("outcome.abuse");
  });

  it("renders spam call dispositions as spam outcomes", () => {
    expect(formatCallDispositionSummary("spam_ended", t)).toBe("outcome.spam");
  });
});

describe("getCallRecordingAvailability", () => {
  it("does not show blocked calls as recording pending", () => {
    expect(
      getCallRecordingAvailability({
        recordingUrl: null,
        disposition: "contact_blocked",
      }),
    ).toBe("unavailable");
  });

  it("keeps normal completed calls without storage in the pending state", () => {
    expect(
      getCallRecordingAvailability({
        recordingUrl: null,
        disposition: "call_completed",
      }),
    ).toBe("pending");
  });

  it("marks expired retained recordings as unavailable", () => {
    expect(
      getCallRecordingAvailability({
        recordingUrl: null,
        recordingRetentionStatus: "expired",
        disposition: "call_completed",
      }),
    ).toBe("unavailable");
  });

  it("marks recordings past their retention expiry as unavailable before cleanup", () => {
    expect(
      getCallRecordingAvailability({
        recordingUrl: null,
        recordingStorageId: "recording-storage-id",
        recordingRetentionStatus: "active",
        recordingExpiresAt: "2000-01-01T00:00:00.000Z",
        disposition: "call_completed",
      }),
    ).toBe("unavailable");
  });

  it("marks calls with a recording URL as ready", () => {
    expect(
      getCallRecordingAvailability({
        recordingUrl: "/recording.wav",
        disposition: "contact_blocked",
      }),
    ).toBe("ready");
  });
});
