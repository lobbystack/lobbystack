import { NextResponse } from "next/server";

import { completeVoiceFollowUpTasks, getCallDetail } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
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
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const body = await readJson(request) as { action?: string };
    if (!body || body.action !== "complete_follow_up") return NextResponse.json({ error: "action must be complete_follow_up." }, { status: 400 });
    const { callId } = await params;
    return NextResponse.json(await completeVoiceFollowUpTasks(createDomainContext(), { userId: session.user.id, businessId, callId }));
  } catch (error) {
    return asApiResponse(error);
  }
}
