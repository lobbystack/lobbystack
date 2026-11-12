import { NextResponse } from "next/server";

import { findDownloadableObject, getCallDetail } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import type { OperatorRequest } from "@/lib/operator-request";

type RecordingObject = NonNullable<Awaited<ReturnType<typeof findDownloadableObject>>>;

/** The call's stored recording, or the error response when the call isn't the business's or has no recording to play. */
export async function callRecordingObject({ userId, businessId, domain }: OperatorRequest, callId: string): Promise<RecordingObject | NextResponse> {
  // A malformed id would make Postgres throw on the uuid comparison.
  const detail = isUuid(callId) ? await getCallDetail(domain, { userId, businessId, callId }) : null;
  if (!detail) return NextResponse.json({ error: "Call not found.", code: "not_found" }, { status: 404 });
  if (detail.recording.state !== "available" || !detail.recording.objectId) {
    const status = detail.recording.state === "expired" ? 410 : 409;
    return NextResponse.json({ error: `Recording is ${detail.recording.state}.`, code: `recording_${detail.recording.state}` }, { status });
  }
  const object = await findDownloadableObject(domain, { userId, businessId, objectId: detail.recording.objectId });
  return object ?? NextResponse.json({ error: "Recording is expired.", code: "recording_expired" }, { status: 410 });
}

/** Where the dashboard plays and downloads the recording: its own origin, so the player can read the bytes without bucket CORS. */
export function recordingAudioPath(callId: string, businessId: string): string {
  return `/api/calls/${encodeURIComponent(callId)}/recording/audio?businessId=${encodeURIComponent(businessId)}`;
}
