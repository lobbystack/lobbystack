import { describe, expect, it } from "vitest";

import {
  captureOutboundAudio,
  acknowledgeOutboundPlaybackMark,
  clearPendingOutboundPlayback,
  flushElapsedOutboundPlayback,
  queuePendingOutboundPlaybackGroup,
  type OutboundPlaybackTracker,
} from "./outboundPlayback";

function buildTracker(): OutboundPlaybackTracker {
  return {
    outboundAudio: [],
    outboundCursorMs: 0,
    outboundQueuedCursorMs: 0,
    activeAssistantResponseId: null,
    pendingOutboundAudio: [],
    pendingOutboundStartMs: null,
    pendingOutboundPlaybackGroups: [],
  };
}

function payloadWithDurationMs(durationMs: number): string {
  const byteLength = Math.max(1, Math.round((durationMs / 1000) * 8000));
  return Buffer.alloc(byteLength, 0).toString("base64");
}

describe("outbound playback tracker", () => {
  it("commits audio only after the matching Twilio mark arrives", () => {
    const tracker = buildTracker();

    captureOutboundAudio(tracker, {
      elapsedMs: 0,
      payload: payloadWithDurationMs(1000),
      responseId: "response-1",
    });
    queuePendingOutboundPlaybackGroup(tracker, "audio-1");

    expect(tracker.outboundAudio).toHaveLength(0);
    expect(acknowledgeOutboundPlaybackMark(tracker, "audio-1")).toBe(true);
    expect(tracker.outboundAudio).toHaveLength(1);
    expect(tracker.outboundAudio[0]).toMatchObject({
      offsetMs: 0,
    });
  });

  it("drops only the unheard queued audio when playback is cleared", () => {
    const tracker = buildTracker();

    captureOutboundAudio(tracker, {
      elapsedMs: 0,
      payload: payloadWithDurationMs(1000),
      responseId: "response-1",
    });
    queuePendingOutboundPlaybackGroup(tracker, "audio-1");
    clearPendingOutboundPlayback(tracker, 500);

    expect(acknowledgeOutboundPlaybackMark(tracker, "audio-1")).toBe(false);
    expect(tracker.outboundAudio).toHaveLength(1);
    expect(Buffer.from(tracker.outboundAudio[0]?.payload ?? "", "base64")).toHaveLength(4000);
    expect(tracker.pendingOutboundPlaybackGroups).toHaveLength(0);
    expect(tracker.outboundQueuedCursorMs).toBe(500);
  });

  it("preserves the elapsed portion of interrupted playback when clearing", () => {
    const tracker = buildTracker();

    captureOutboundAudio(tracker, {
      elapsedMs: 0,
      payload: payloadWithDurationMs(1000),
      responseId: "response-1",
    });
    queuePendingOutboundPlaybackGroup(tracker, "audio-1");

    clearPendingOutboundPlayback(tracker, 500);

    expect(tracker.outboundAudio).toHaveLength(1);
    expect(tracker.outboundAudio[0]?.offsetMs).toBe(0);
    expect(Buffer.from(tracker.outboundAudio[0]?.payload ?? "", "base64")).toHaveLength(4000);
    expect(tracker.pendingOutboundPlaybackGroups).toHaveLength(0);
  });

  it("keeps real-time gaps between later chunks", () => {
    const tracker = buildTracker();

    captureOutboundAudio(tracker, {
      elapsedMs: 0,
      payload: payloadWithDurationMs(1000),
      responseId: "response-1",
    });
    queuePendingOutboundPlaybackGroup(tracker, "audio-1");
    captureOutboundAudio(tracker, {
      elapsedMs: 5000,
      payload: payloadWithDurationMs(1000),
      responseId: "response-2",
    });
    queuePendingOutboundPlaybackGroup(tracker, "audio-2");

    acknowledgeOutboundPlaybackMark(tracker, "audio-1");
    acknowledgeOutboundPlaybackMark(tracker, "audio-2");

    expect(tracker.outboundAudio[0]?.offsetMs).toBe(0);
    expect(tracker.outboundAudio[1]?.offsetMs).toBe(5000);
  });

  it("flushes only the elapsed portion of pending groups by teardown time", () => {
    const tracker = buildTracker();

    captureOutboundAudio(tracker, {
      elapsedMs: 0,
      payload: payloadWithDurationMs(1000),
      responseId: "response-1",
    });
    queuePendingOutboundPlaybackGroup(tracker, "audio-1");
    captureOutboundAudio(tracker, {
      elapsedMs: 1000,
      payload: payloadWithDurationMs(1000),
      responseId: "response-2",
    });
    queuePendingOutboundPlaybackGroup(tracker, "audio-2");

    flushElapsedOutboundPlayback(tracker, 1500);

    expect(tracker.outboundAudio).toHaveLength(2);
    expect(tracker.outboundAudio[0]?.offsetMs).toBe(0);
    expect(tracker.outboundAudio[1]?.offsetMs).toBe(1000);
    expect(Buffer.from(tracker.outboundAudio[1]?.payload ?? "", "base64")).toHaveLength(4000);
    expect(tracker.pendingOutboundPlaybackGroups).toHaveLength(1);
    expect(tracker.pendingOutboundPlaybackGroups[0]?.markName).toBe("audio-2");
    expect(tracker.pendingOutboundPlaybackGroups[0]?.chunks[0]?.offsetMs).toBe(1500);
  });

  it("keeps the elapsed portion of a partially played group during teardown flush", () => {
    const tracker = buildTracker();

    captureOutboundAudio(tracker, {
      elapsedMs: 0,
      payload: payloadWithDurationMs(1000),
      responseId: "response-1",
    });
    queuePendingOutboundPlaybackGroup(tracker, "audio-1");

    flushElapsedOutboundPlayback(tracker, 500);

    expect(tracker.outboundAudio).toHaveLength(1);
    expect(Buffer.from(tracker.outboundAudio[0]?.payload ?? "", "base64")).toHaveLength(4000);
    expect(tracker.pendingOutboundPlaybackGroups).toHaveLength(1);
    expect(Buffer.from(tracker.pendingOutboundPlaybackGroups[0]?.chunks[0]?.payload ?? "", "base64"))
      .toHaveLength(4000);
    expect(tracker.pendingOutboundPlaybackGroups[0]?.chunks[0]?.offsetMs).toBe(500);
  });
});
