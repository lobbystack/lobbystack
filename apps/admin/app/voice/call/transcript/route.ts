import { NextResponse } from "next/server";

import { voiceCallTranscriptRequestSchema } from "@lobbystack/contracts";
import { upsertTranscript } from "@lobbystack/domain";
import { asApiResponse, createDomainContext, requireInternalService } from "@/lib/voice-route-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { const rawBody = await request.text(); await requireInternalService(request, rawBody); const body = voiceCallTranscriptRequestSchema.parse(JSON.parse(rawBody)); return NextResponse.json(await upsertTranscript(createDomainContext(), { businessId: body.businessId, callId: body.callId, sequence: body.sequence, speaker: body.speaker, text: body.text, final: body.final, ...(body.confidence !== undefined ? { confidence: body.confidence } : {}) })); } catch (error) { return asApiResponse(error); }
}
