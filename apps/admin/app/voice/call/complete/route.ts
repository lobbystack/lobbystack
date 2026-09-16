import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { voiceCallCompleteRequestSchema } from "@lobbystack/contracts";
import { completeCall } from "@lobbystack/domain";
import { asApiResponse, createDomainContext, getAppDatabase, requireInternalService } from "@/lib/voice-route-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { const rawBody = await request.text(); await requireInternalService(request, rawBody); const body = voiceCallCompleteRequestSchema.parse(JSON.parse(rawBody)); const resolved = await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_call_id(${body.callId}::uuid) as business_id`); const businessId = resolved.rows[0]?.business_id; if (!businessId) return NextResponse.json({ error: "Call not found." }, { status: 404 }); await completeCall(createDomainContext(), { callId: body.callId, status: body.status, endedAt: body.endedAt, businessId, ...(body.disposition !== undefined ? { disposition: body.disposition } : {}), ...(body.providerDurationSeconds !== undefined ? { providerDurationSeconds: body.providerDurationSeconds } : {}) }); return NextResponse.json({ ok: true }); } catch (error) { return asApiResponse(error); }
}
