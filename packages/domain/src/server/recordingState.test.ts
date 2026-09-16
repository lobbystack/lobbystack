import { describe, expect, it } from "vitest";
import { recordingListState, recordingState } from "./recordingState";

const phoneCall = { recordingObjectId: null, recordingStatus: null, retentionUntil: null, transport: "voice", disposition: "completed" };

describe("call recording availability", () => {
  it("matches main's unavailable state until a recording object exists", () => {
    expect(recordingState(phoneCall)).toBe("missing");
    expect(recordingListState(phoneCall)).toBe("pending");
  });

  it.each(["busy", "no_answer", "missed", "canceled", "cancelled", "contact_blocked"])("does not promise a recording for %s", (disposition) => {
    expect(recordingState({ ...phoneCall, disposition })).toBe("missing");
    expect(recordingListState({ ...phoneCall, disposition })).toBe("missing");
  });

  it("does not promise a recording for an unrecorded browser call", () => {
    expect(recordingState({ ...phoneCall, transport: "webrtc" })).toBe("missing");
  });

  it("exposes only ready stored recordings and respects retention", () => {
    const stored = { ...phoneCall, recordingObjectId: "recording", recordingStatus: "ready" };
    expect(recordingState(stored)).toBe("available");
    expect(recordingState({ ...stored, recordingStatus: "pending" })).toBe("pending");
    expect(recordingState({ ...stored, recordingStatus: "deleted" })).toBe("expired");
    expect(recordingState({ ...stored, retentionUntil: new Date(0) })).toBe("expired");
  });
});
