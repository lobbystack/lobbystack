import { MAX_PHONE_CALL_MS } from "@lobbystack/shared";

export type RecordingState = "available" | "pending" | "expired" | "missing";

// The recording copy gives up about 5 minutes after the call ends
// (LIVE_RECORDING_ATTEMPTS), so a call with none by this long won't get one.
const RECORDING_WAIT_MS = 10 * 60_000;

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

export function recordingListState(input: Parameters<typeof recordingState>[0] & { startedAt: Date; endedAt: Date | null }): RecordingState {
  const storedState = recordingState(input);
  if (input.recordingObjectId || storedState === "expired") return storedState;
  // Legacy voice-gateway browser calls were never recorded, and some were never closed.
  if (input.transport === "webrtc") return "missing";
  const disposition = input.disposition?.trim().toLowerCase() ?? "";
  if (["blocked_contact", "busy", "no_answer", "missed", "canceled", "cancelled"].some(value => disposition.includes(value))) return "missing";
  // Main's list anticipates asynchronous phone recordings; its detail tab does not.
  // A call still open past its longest possible length was left open by a crash.
  const endedAt = input.endedAt?.getTime() ?? input.startedAt.getTime() + MAX_PHONE_CALL_MS;
  return Date.now() - endedAt < RECORDING_WAIT_MS ? "pending" : "missing";
}
