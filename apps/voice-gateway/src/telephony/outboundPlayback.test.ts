import { describe, expect, it } from "vitest";

import {
  acknowledgeOutboundPlaybackMark,
  clearPendingOutboundPlayback,
  flushElapsedOutboundPlayback,
  queueOutboundPlaybackMark,
  type OutboundPlaybackTracker,
} from "./outboundPlayback";

function buildTracker(): OutboundPlaybackTracker {
  return {
    outboundAudio: [],
    outboundCursorMs: 0,
    outboundQueuedCursorMs: 0,
    pendingOutboundPlaybackMarks: [],
  };
}

function payloadWithDurationMs(durationMs: number): string {
  const byteLength = Math.max(1, Math.round((durationMs / 1000) * 8000));
  return Buffer.alloc(byteLength, 0).toString("base64");
}

describe("outbound playback tracker", () => {
  it("commits audio only after the matching Twilio mark arrives", () => {
    const tracker = buildTracker();

    queueOutboundPlaybackMark(tracker, {
      elapsedMs: 0,
      markName: "audio-1",
      payload: payloadWithDurationMs(1000),
    });

    expect(tracker.outboundAudio).toHaveLength(0);
    expect(acknowledgeOutboundPlaybackMark(tracker, "audio-1")).toBe(true);
    expect(tracker.outboundAudio).toHaveLength(1);
    expect(tracker.outboundAudio[0]).toMatchObject({
      offsetMs: 0,
    });
  });

  it("drops queued audio when playback is cleared", () => {
    const tracker = buildTracker();

    queueOutboundPlaybackMark(tracker, {
      elapsedMs: 0,
      markName: "audio-1",
      payload: payloadWithDurationMs(1000),
    });
    clearPendingOutboundPlayback(tracker, 500);

    expect(acknowledgeOutboundPlaybackMark(tracker, "audio-1")).toBe(false);
    expect(tracker.outboundAudio).toHaveLength(0);
    expect(tracker.pendingOutboundPlaybackMarks).toHaveLength(0);
    expect(tracker.outboundQueuedCursorMs).toBe(500);
  });

  it("keeps real-time gaps between later chunks", () => {
    const tracker = buildTracker();

    queueOutboundPlaybackMark(tracker, {
      elapsedMs: 0,
      markName: "audio-1",
      payload: payloadWithDurationMs(1000),
    });
    queueOutboundPlaybackMark(tracker, {
      elapsedMs: 5000,
      markName: "audio-2",
      payload: payloadWithDurationMs(1000),
    });

    acknowledgeOutboundPlaybackMark(tracker, "audio-1");
    acknowledgeOutboundPlaybackMark(tracker, "audio-2");

    expect(tracker.outboundAudio[0]?.offsetMs).toBe(0);
    expect(tracker.outboundAudio[1]?.offsetMs).toBe(5000);
  });

  it("flushes only chunks that should already have played by teardown time", () => {
    const tracker = buildTracker();

    queueOutboundPlaybackMark(tracker, {
      elapsedMs: 0,
      markName: "audio-1",
      payload: payloadWithDurationMs(1000),
    });
    queueOutboundPlaybackMark(tracker, {
      elapsedMs: 1000,
      markName: "audio-2",
      payload: payloadWithDurationMs(1000),
    });

    flushElapsedOutboundPlayback(tracker, 1500);

    expect(tracker.outboundAudio).toHaveLength(1);
    expect(tracker.pendingOutboundPlaybackMarks).toHaveLength(1);
    expect(tracker.pendingOutboundPlaybackMarks[0]?.markName).toBe("audio-2");
  });
});
