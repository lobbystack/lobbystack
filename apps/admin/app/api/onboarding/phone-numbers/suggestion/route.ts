import { NextResponse } from "next/server";

import { searchAvailableBusinessNumbers } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { getNumberClaimTokenSecret, getTwilioProvider } from "@/lib/twilio-provider";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";

export async function GET(request: Request) {
  try { const session = await requireApiSession(request); const businessId = businessIdFromRequest(request); if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 }); await assertPhoneNumberSearchAllowed({ userId: session.user.id, initial: true }); return NextResponse.json({ numbers: await searchAvailableBusinessNumbers(createDomainContext(), { userId: session.user.id, businessId, limit: 6, claimTokenSecret: getNumberClaimTokenSecret() }, getTwilioProvider()) }); } catch (error) { return asApiResponse(error); }
}
