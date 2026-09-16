import { NextResponse } from "next/server";

import { checkPhoneVerification } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { getTwilioProvider, getTwilioVerifyServiceSid } from "@/lib/twilio-provider";

export async function POST(request: Request) {
  try { const session = await requireApiSession(request); const businessId = businessIdFromRequest(request); const body = await readJson(request) as { attemptId?: string; code?: string }; if (!businessId || !body.attemptId || !body.code) return NextResponse.json({ error: "businessId, attemptId, and code are required." }, { status: 400 }); return NextResponse.json(await checkPhoneVerification(createDomainContext(), { userId: session.user.id, businessId, attemptId: body.attemptId, code: body.code, serviceSid: getTwilioVerifyServiceSid() }, getTwilioProvider())); } catch (error) { return asApiResponse(error); }
}
