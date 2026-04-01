import type { TimedAudioChunk } from "../audio/wav";

type PendingOutboundPlaybackGroup = {
  markName: string;
  chunks: Array<TimedAudioChunk>;
  endOffsetMs: number;
};

export type OutboundPlaybackTracker = {
  outboundAudio: Array<TimedAudioChunk>;
  outboundCursorMs: number;
  outboundQueuedCursorMs: number;
  activeAssistantResponseId: string | null;
  pendingOutboundAudio: Array<string>;
  pendingOutboundStartMs: number | null;
  pendingOutboundPlaybackGroups: Array<PendingOutboundPlaybackGroup>;
};

function estimatePayloadDurationMs(payload: string, sampleRate = 8000): number {
  const sampleCount = Buffer.from(payload, "base64").length;
  return (sampleCount / sampleRate) * 1000;
}

function buildPendingOutboundChunks(
  tracker: OutboundPlaybackTracker,
): {
  chunks: Array<TimedAudioChunk>;
  endOffsetMs: number;
} | null {
  if (tracker.pendingOutboundAudio.length === 0) {
    return null;
  }

  let cursorMs = tracker.pendingOutboundStartMs ?? tracker.outboundQueuedCursorMs;
  const chunks: Array<TimedAudioChunk> = [];
  for (const payload of tracker.pendingOutboundAudio) {
    chunks.push({
      offsetMs: cursorMs,
      payload,
    });
    cursorMs += estimatePayloadDurationMs(payload);
  }

  return {
    chunks,
    endOffsetMs: cursorMs,
  };
}

function clearPendingCurrentResponse(tracker: OutboundPlaybackTracker): void {
  tracker.activeAssistantResponseId = null;
  tracker.pendingOutboundAudio = [];
  tracker.pendingOutboundStartMs = null;
}

function commitPlayedGroup(
  tracker: OutboundPlaybackTracker,
  group: PendingOutboundPlaybackGroup,
): void {
  tracker.outboundAudio.push(...group.chunks);
  tracker.outboundCursorMs = Math.max(tracker.outboundCursorMs, group.endOffsetMs);
}

export function captureOutboundAudio(
  tracker: OutboundPlaybackTracker,
  input: {
    elapsedMs: number;
    payload: string;
    responseId?: string;
  },
): void {
  if (input.responseId && input.responseId !== tracker.activeAssistantResponseId) {
    clearPendingCurrentResponse(tracker);
    tracker.activeAssistantResponseId = input.responseId;
    tracker.pendingOutboundStartMs = Math.max(
      tracker.outboundCursorMs,
      tracker.outboundQueuedCursorMs,
      input.elapsedMs,
    );
  } else if (!tracker.activeAssistantResponseId) {
    tracker.activeAssistantResponseId = input.responseId ?? crypto.randomUUID();
    tracker.pendingOutboundStartMs = Math.max(
      tracker.outboundCursorMs,
      tracker.outboundQueuedCursorMs,
      input.elapsedMs,
    );
  }

  tracker.pendingOutboundAudio.push(input.payload);
}

export function queuePendingOutboundPlaybackGroup(
  tracker: OutboundPlaybackTracker,
  markName: string,
): boolean {
  const pendingGroup = buildPendingOutboundChunks(tracker);
  if (!pendingGroup) {
    clearPendingCurrentResponse(tracker);
    return false;
  }

  tracker.pendingOutboundPlaybackGroups.push({
    markName,
    chunks: pendingGroup.chunks,
    endOffsetMs: pendingGroup.endOffsetMs,
  });
  tracker.outboundQueuedCursorMs = pendingGroup.endOffsetMs;
  clearPendingCurrentResponse(tracker);
  return true;
}

export function acknowledgeOutboundPlaybackMark(
  tracker: OutboundPlaybackTracker,
  markName: string,
): boolean {
  const pendingIndex = tracker.pendingOutboundPlaybackGroups.findIndex(
    (group) => group.markName === markName,
  );
  if (pendingIndex === -1) {
    return false;
  }

  const [playedGroup] = tracker.pendingOutboundPlaybackGroups.splice(pendingIndex, 1);
  if (!playedGroup) {
    return false;
  }

  commitPlayedGroup(tracker, playedGroup);
  return true;
}

export function clearPendingOutboundPlayback(
  tracker: OutboundPlaybackTracker,
  elapsedMs: number,
): void {
  clearPendingCurrentResponse(tracker);
  tracker.pendingOutboundPlaybackGroups = [];
  tracker.outboundQueuedCursorMs = Math.max(tracker.outboundCursorMs, elapsedMs);
}

export function flushElapsedOutboundPlayback(
  tracker: OutboundPlaybackTracker,
  elapsedMs: number,
): void {
  const remainingGroups: Array<PendingOutboundPlaybackGroup> = [];

  for (const pendingGroup of tracker.pendingOutboundPlaybackGroups) {
    if (pendingGroup.endOffsetMs <= elapsedMs) {
      commitPlayedGroup(tracker, pendingGroup);
      continue;
    }

    remainingGroups.push(pendingGroup);
  }

  tracker.pendingOutboundPlaybackGroups = remainingGroups;
  tracker.outboundQueuedCursorMs = Math.max(
    tracker.outboundCursorMs,
    tracker.pendingOutboundPlaybackGroups.at(-1)?.endOffsetMs ?? tracker.outboundQueuedCursorMs,
  );
}
