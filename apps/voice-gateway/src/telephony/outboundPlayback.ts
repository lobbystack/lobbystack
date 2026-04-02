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

function slicePayloadByDuration(
  payload: string,
  input: {
    startMs?: number;
    endMs?: number;
    sampleRate?: number;
  },
): {
  payload: string;
  durationMs: number;
} | null {
  const sampleRate = input.sampleRate ?? 8000;
  const bytes = Buffer.from(payload, "base64");
  const startSample = Math.max(0, Math.floor(((input.startMs ?? 0) * sampleRate) / 1000));
  const endSample = Math.max(
    startSample,
    Math.min(
      bytes.length,
      input.endMs === undefined
        ? bytes.length
        : Math.floor((input.endMs * sampleRate) / 1000),
    ),
  );

  if (endSample <= startSample) {
    return null;
  }

  const sliced = bytes.subarray(startSample, endSample);
  return {
    payload: sliced.toString("base64"),
    durationMs: (sliced.length / sampleRate) * 1000,
  };
}

function buildPlaybackGroup(
  markName: string,
  chunks: Array<TimedAudioChunk>,
): PendingOutboundPlaybackGroup | null {
  if (chunks.length === 0) {
    return null;
  }

  const lastChunk = chunks[chunks.length - 1];
  if (!lastChunk) {
    return null;
  }

  return {
    markName,
    chunks,
    endOffsetMs: lastChunk.offsetMs + estimatePayloadDurationMs(lastChunk.payload),
  };
}

function splitPlaybackGroupAtElapsed(
  group: PendingOutboundPlaybackGroup,
  elapsedMs: number,
): {
  playedGroup: PendingOutboundPlaybackGroup | null;
  remainingGroup: PendingOutboundPlaybackGroup | null;
} {
  const playedChunks: Array<TimedAudioChunk> = [];
  const remainingChunks: Array<TimedAudioChunk> = [];

  for (const chunk of group.chunks) {
    const chunkEndMs = chunk.offsetMs + estimatePayloadDurationMs(chunk.payload);

    if (chunkEndMs <= elapsedMs) {
      playedChunks.push(chunk);
      continue;
    }

    if (chunk.offsetMs >= elapsedMs) {
      remainingChunks.push(chunk);
      continue;
    }

    const playedSlice = slicePayloadByDuration(chunk.payload, {
      endMs: elapsedMs - chunk.offsetMs,
    });
    if (playedSlice) {
      playedChunks.push({
        offsetMs: chunk.offsetMs,
        payload: playedSlice.payload,
      });
    }

    const remainingSlice = slicePayloadByDuration(chunk.payload, {
      startMs: elapsedMs - chunk.offsetMs,
    });
    if (remainingSlice) {
      remainingChunks.push({
        offsetMs: chunk.offsetMs + (playedSlice?.durationMs ?? 0),
        payload: remainingSlice.payload,
      });
    }
  }

  return {
    playedGroup: buildPlaybackGroup(group.markName, playedChunks),
    remainingGroup: buildPlaybackGroup(group.markName, remainingChunks),
  };
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

  for (const pendingGroup of tracker.pendingOutboundPlaybackGroups) {
    const { playedGroup } = splitPlaybackGroupAtElapsed(pendingGroup, elapsedMs);
    if (playedGroup) {
      commitPlayedGroup(tracker, playedGroup);
    }
  }

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

    const { playedGroup, remainingGroup } = splitPlaybackGroupAtElapsed(
      pendingGroup,
      elapsedMs,
    );
    if (playedGroup) {
      commitPlayedGroup(tracker, playedGroup);
    }
    if (remainingGroup) {
      remainingGroups.push(remainingGroup);
    }
  }

  tracker.pendingOutboundPlaybackGroups = remainingGroups;
  tracker.outboundQueuedCursorMs = Math.max(
    tracker.outboundCursorMs,
    tracker.pendingOutboundPlaybackGroups.at(-1)?.endOffsetMs ?? tracker.outboundQueuedCursorMs,
  );
}
