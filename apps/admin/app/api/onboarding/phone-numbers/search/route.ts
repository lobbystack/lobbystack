import { NextResponse } from "next/server";

import { searchBusinessNumberInventory, type NumberSelection } from "@lobbystack/domain";
import { asApiResponse, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { getNumberClaimTokenSecret, getTwilioProvider } from "@/lib/twilio-provider";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";

export async function POST(request: Request) {
  try { const { session, businessId } = await requireOperatorBusiness(request); const body = await readJson(request) as { selection?: Partial<NumberSelection>; limit?: number }; await assertPhoneNumberSearchAllowed({ userId: session.user.id, initial: false }); return NextResponse.json(await searchBusinessNumberInventory(createDomainContext(), { userId: session.user.id, businessId, ...(body.selection ? { selection: body.selection } : {}), ...(body.limit !== undefined ? { limit: body.limit } : {}), claimTokenSecret: getNumberClaimTokenSecret() }, getTwilioProvider())); } catch (error) { return asApiResponse(error); }
}
