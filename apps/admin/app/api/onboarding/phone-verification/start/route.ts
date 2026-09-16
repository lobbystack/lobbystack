import { NextResponse } from "next/server";

import { requestPhoneVerification } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { getTwilioProvider } from "@/lib/twilio-provider";

export async function POST(request: Request) {
  try { const session = await requireApiSession(request); const businessId = businessIdFromRequest(request); const body = await readJson(request) as { phoneNumber?: string }; if (!businessId || !body.phoneNumber) return NextResponse.json({ error: "businessId and phoneNumber are required." }, { status: 400 }); return NextResponse.json({ attemptId: await requestPhoneVerification(createDomainContext(), { userId: session.user.id, businessId, phoneNumber: body.phoneNumber }, getTwilioProvider()) }, { status: 202 }); } catch (error) { return asApiResponse(error); }
}
