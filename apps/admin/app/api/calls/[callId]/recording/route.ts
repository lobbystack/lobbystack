import { NextResponse } from "next/server";

import { operatorRoute } from "@/lib/operator-request";
import { callRecordingObject, recordingAudioPath } from "./recording-object";

export const dynamic = "force-dynamic";

/** Where to play the call's recording. The bytes come from the dashboard's own origin, whatever the storage provider, so the player can draw the waveform. */
export const GET = operatorRoute<{ callId: string }>(async (operator, { callId }) => {
  const object = await callRecordingObject(operator, callId);
  if (object instanceof NextResponse) return object;
  return NextResponse.json({
    url: recordingAudioPath(callId, operator.businessId),
    fileName: object.fileName,
    contentType: object.contentType,
    length: object.contentLength,
  });
});
