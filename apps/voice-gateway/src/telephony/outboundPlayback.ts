import type { TimedAudioChunk } from "../audio/wav";

type PendingOutboundPlaybackMark = {
  markName: string;
  offsetMs: number;
  endOffsetMs: number;
  payload: string;
};

export type OutboundPlaybackTracker = {
  outboundAudio: Array<TimedAudioChunk>;
  outboundCursorMs: number;
  outboundQueuedCursorMs: number;
  pendingOutboundPlaybackMarks: Array<PendingOutboundPlaybackMark>;
};

function estimatePayloadDurationMs(payload: string, sampleRate = 8000): number {
  const sampleCount = Buffer.from(payload, "base64").length;
  return (sampleCount / sampleRate) * 1000;
}

function commitPlayedChunk(
  tracker: OutboundPlaybackTracker,
  chunk: PendingOutboundPlaybackMark,
): void {
  tracker.outboundAudio.push({
    offsetMs: chunk.offsetMs,
    payload: chunk.payload,
  });
  tracker.outboundCursorMs = Math.max(tracker.outboundCursorMs, chunk.endOffsetMs);
}

export function queueOutboundPlaybackMark(
  tracker: OutboundPlaybackTracker,
  input: {
    elapsedMs: number;
    markName: string;
    payload: string;
  },
): void {
  const offsetMs = Math.max(
    tracker.outboundCursorMs,
    tracker.outboundQueuedCursorMs,
    input.elapsedMs,
  );
  const endOffsetMs = offsetMs + estimatePayloadDurationMs(input.payload);

  tracker.pendingOutboundPlaybackMarks.push({
    markName: input.markName,
    offsetMs,
    endOffsetMs,
    payload: input.payload,
  });
  tracker.outboundQueuedCursorMs = endOffsetMs;
}

export function acknowledgeOutboundPlaybackMark(
  tracker: OutboundPlaybackTracker,
  markName: string,
): boolean {
  const pendingIndex = tracker.pendingOutboundPlaybackMarks.findIndex(
    (mark) => mark.markName === markName,
  );
  if (pendingIndex === -1) {
    return false;
  }

  const [playedChunk] = tracker.pendingOutboundPlaybackMarks.splice(pendingIndex, 1);
  if (!playedChunk) {
    return false;
  }

  commitPlayedChunk(tracker, playedChunk);
  return true;
}

export function clearPendingOutboundPlayback(
  tracker: OutboundPlaybackTracker,
  elapsedMs: number,
): void {
  tracker.pendingOutboundPlaybackMarks = [];
  tracker.outboundQueuedCursorMs = Math.max(tracker.outboundCursorMs, elapsedMs);
}

export function flushElapsedOutboundPlayback(
  tracker: OutboundPlaybackTracker,
  elapsedMs: number,
): void {
  const remainingMarks: Array<PendingOutboundPlaybackMark> = [];

  for (const pendingMark of tracker.pendingOutboundPlaybackMarks) {
    if (pendingMark.endOffsetMs <= elapsedMs) {
      commitPlayedChunk(tracker, pendingMark);
      continue;
    }

    remainingMarks.push(pendingMark);
  }

  tracker.pendingOutboundPlaybackMarks = remainingMarks;
  tracker.outboundQueuedCursorMs = Math.max(
    tracker.outboundCursorMs,
    tracker.pendingOutboundPlaybackMarks.at(-1)?.endOffsetMs ?? tracker.outboundQueuedCursorMs,
  );
}
