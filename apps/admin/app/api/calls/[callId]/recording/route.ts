import { NextResponse } from "next/server";

import { createObjectDownload, getCallDetail } from "@lobbystack/domain";
import { createStorageProvider } from "@lobbystack/providers";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await params;
    const resolved = await withOperatorTransaction(request, async ({ session, businessId }) => ({
      session,
      businessId,
      detail: await getCallDetail(createDomainContext(), { userId: session.user.id, businessId, callId }),
    }));
    const { session, businessId, detail } = resolved;
    if (!detail) return NextResponse.json({ error: "Call not found.", code: "not_found" }, { status: 404 });
    if (detail.recording.state !== "available" || !detail.recording.objectId) {
      const status = detail.recording.state === "expired" ? 410 : 409;
      return NextResponse.json({ error: `Recording is ${detail.recording.state}.`, code: `recording_${detail.recording.state}` }, { status });
    }
    return NextResponse.json(await createObjectDownload(createDomainContext(), { userId: session.user.id, businessId, objectId: detail.recording.objectId }, createStorageProvider()));
  } catch (error) {
    return asApiResponse(error);
  }
}
