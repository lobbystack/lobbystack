import { NextResponse } from "next/server";

import { searchAvailableBusinessNumbers, type NumberSelection } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";
import { getNumberClaimTokenSecret, getTwilioProvider } from "@/lib/twilio-provider";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    const body = await readJson(request) as { selection?: Partial<NumberSelection>; limit?: number };
    if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });
    await assertPhoneNumberSearchAllowed({ userId: session.user.id, initial: false });
    const numbers = await searchAvailableBusinessNumbers(createDomainContext(), { userId: session.user.id, businessId, purpose: "replacement", ...(body.selection ? { selection: body.selection } : {}), ...(body.limit !== undefined ? { limit: body.limit } : {}), claimTokenSecret: getNumberClaimTokenSecret() }, getTwilioProvider());
    return NextResponse.json({ numbers });
  } catch (error) { return asApiResponse(error); }
}
