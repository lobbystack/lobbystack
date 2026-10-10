import { NextResponse } from "next/server";

import { createObjectDownload, getCallDetail } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { operatorRoute } from "@/lib/operator-request";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const GET = operatorRoute<{ callId: string }>(async ({ userId, businessId, domain }, { callId }) => {
  // A malformed id would make Postgres throw on the uuid comparison.
  const detail = isUuid(callId) ? await getCallDetail(domain, { userId, businessId, callId }) : null;
  if (!detail) return NextResponse.json({ error: "Call not found.", code: "not_found" }, { status: 404 });
  if (detail.recording.state !== "available" || !detail.recording.objectId) {
    const status = detail.recording.state === "expired" ? 410 : 409;
    return NextResponse.json({ error: `Recording is ${detail.recording.state}.`, code: `recording_${detail.recording.state}` }, { status });
  }
  return NextResponse.json(await createObjectDownload(domain, { userId, businessId, objectId: detail.recording.objectId }, getStorageProvider()));
});
