import { NextResponse } from "next/server";

import { createObjectDownload, getCallDetail } from "@lobbystack/domain";
import { LocalStorageProvider } from "@lobbystack/providers/storage/local";
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
  const storage = getStorageProvider();
  const download = await createObjectDownload(domain, { userId, businessId, objectId: detail.recording.objectId }, storage);
  // Local storage signs URLs on APP_BASE_URL, which can be a tunnel or another host than the one the operator is on. The player fetches and plays the file in the browser, so serve it from the dashboard's own origin.
  if (storage instanceof LocalStorageProvider) {
    const signed = new URL(download.url);
    return NextResponse.json({ ...download, url: `${signed.pathname}${signed.search}` });
  }
  return NextResponse.json(download);
});
