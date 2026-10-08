import { NextResponse } from "next/server";

import { completeVoiceFollowUpTasks, getCallDetail } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { asApiResponse, jsonError, readJson, requireOperatorBusiness, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await params;
    const detail = await withOperatorTransaction(request, async ({ session, businessId }) => await getCallDetail(createDomainContext(), { userId: session.user.id, businessId, callId }));
    if (!detail) return NextResponse.json({ error: "Call not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request) as { action?: string; inboxItemId?: unknown };
    if (!body || body.action !== "complete_follow_up") return jsonError("action must be complete_follow_up.", 400);
    // With inboxItemId, only that follow-up; without, every one on the call.
    const { inboxItemId } = body;
    if (inboxItemId !== undefined && !isUuid(inboxItemId)) return jsonError("inboxItemId must be a UUID.", 400, "invalid_request");
    const { callId } = await params;
    return NextResponse.json(await completeVoiceFollowUpTasks(createDomainContext(), { userId: session.user.id, businessId, callId, ...(inboxItemId ? { inboxItemId } : {}) }));
  } catch (error) {
    return asApiResponse(error);
  }
}
