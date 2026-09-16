import { NextResponse } from "next/server";

import { voiceCallStartRequestSchema } from "@lobbystack/contracts";
import { startCall } from "@lobbystack/domain";
import { asApiResponse, createDomainContext, requireInternalService } from "@/lib/voice-route-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    await requireInternalService(request, rawBody);
    const body = voiceCallStartRequestSchema.parse(JSON.parse(rawBody));
    return NextResponse.json(await startCall(createDomainContext(), { businessId: body.businessId, provider: "twilio", providerCallId: body.providerCallId, from: body.from, to: body.to, transport: body.channel, ...(body.gatewaySessionId ? { gatewaySessionId: body.gatewaySessionId } : {}), startedAt: body.startedAt }));
  } catch (error) { return asApiResponse(error); }
}
