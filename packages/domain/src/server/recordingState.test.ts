import { describe, expect, it } from "vitest";
import { recordingListState, recordingState } from "./recordingState";

const phoneCall = { recordingObjectId: null, recordingStatus: null, retentionUntil: null, transport: "voice", disposition: "completed", startedAt: new Date(), endedAt: new Date() };

describe("call recording availability", () => {
  it("matches main's unavailable state until a recording object exists", () => {
    expect(recordingState(phoneCall)).toBe("missing");
    expect(recordingListState(phoneCall)).toBe("pending");
  });

  it.each(["busy", "no_answer", "missed", "canceled", "cancelled", "blocked_contact"])("does not promise a recording for %s", (disposition) => {
    expect(recordingState({ ...phoneCall, disposition })).toBe("missing");
    expect(recordingListState({ ...phoneCall, disposition })).toBe("missing");
  });

  it("lists a call as pending while it runs and for 10 minutes after it ends, then as missing", () => {
    const endedAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
    expect(recordingListState({ ...phoneCall, endedAt: null })).toBe("pending");
    expect(recordingListState({ ...phoneCall, endedAt: endedAgo(9) })).toBe("pending");
    // The copy gave up, failed setup never queued one, or OpenAI kept no recording.
    expect(recordingListState({ ...phoneCall, endedAt: endedAgo(11) })).toBe("missing");
    expect(recordingListState({ ...phoneCall, transport: "web_voice", disposition: "setup_failed", endedAt: endedAgo(60) })).toBe("missing");
  });

  it("does not promise a recording for an unrecorded browser call", () => {
    expect(recordingState({ ...phoneCall, transport: "webrtc" })).toBe("missing");
  });

  it("stops listing a call left open as pending once it's past the longest call and the recording wait", () => {
    const startedAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
    expect(recordingListState({ ...phoneCall, transport: "webrtc", endedAt: null })).toBe("missing");
    expect(recordingListState({ ...phoneCall, startedAt: startedAgo(39), endedAt: null })).toBe("pending");
    expect(recordingListState({ ...phoneCall, startedAt: startedAgo(41), endedAt: null })).toBe("missing");
  });

  it("exposes only ready stored recordings and respects retention", () => {
    const stored = { ...phoneCall, recordingObjectId: "recording", recordingStatus: "ready" };
    expect(recordingState(stored)).toBe("available");
    expect(recordingState({ ...stored, recordingStatus: "pending" })).toBe("pending");
    expect(recordingState({ ...stored, recordingStatus: "deleted" })).toBe("expired");
    expect(recordingState({ ...stored, retentionUntil: new Date(0) })).toBe("expired");
  });
});
