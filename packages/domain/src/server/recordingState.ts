export type RecordingState = "available" | "pending" | "expired" | "missing";

export function recordingState(input: {
  recordingObjectId: string | null;
  recordingStatus: string | null;
  retentionUntil: Date | null;
  transport: string;
  disposition: string | null;
}): RecordingState {
  if (input.recordingStatus === "deleted" || (input.retentionUntil !== null && input.retentionUntil <= new Date())) return "expired";
  if (input.recordingObjectId) return input.recordingStatus === "ready" ? "available" : "pending";
  // Main only shows pending once a recording object exists.
  return "missing";
}

export function recordingListState(input: Parameters<typeof recordingState>[0]): RecordingState {
  const storedState = recordingState(input);
  if (input.recordingObjectId || storedState === "expired") return storedState;
  if (input.transport === "webrtc") return "missing";
  const disposition = input.disposition?.trim().toLowerCase() ?? "";
  if (["contact_blocked", "busy", "no_answer", "missed", "canceled", "cancelled"].some(value => disposition.includes(value))) return "missing";
  // Main's list anticipates asynchronous phone recordings; its detail tab does not.
  return "pending";
}
