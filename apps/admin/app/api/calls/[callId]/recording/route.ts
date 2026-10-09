import { NextResponse } from "next/server";

import { createObjectDownload, getCallDetail } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await params;
    const { session, businessId } = await requireOperatorBusiness(request);
    // A malformed id would make Postgres throw on the uuid comparison.
    const detail = isUuid(callId) ? await getCallDetail(createDomainContext(), { userId: session.user.id, businessId, callId }) : null;
    if (!detail) return NextResponse.json({ error: "Call not found.", code: "not_found" }, { status: 404 });
    if (detail.recording.state !== "available" || !detail.recording.objectId) {
      const status = detail.recording.state === "expired" ? 410 : 409;
      return NextResponse.json({ error: `Recording is ${detail.recording.state}.`, code: `recording_${detail.recording.state}` }, { status });
    }
    return NextResponse.json(await createObjectDownload(createDomainContext(), { userId: session.user.id, businessId, objectId: detail.recording.objectId }, getStorageProvider()));
  } catch (error) {
    return asApiResponse(error);
  }
}
