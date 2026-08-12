import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { reserveReplacementNumberClaim } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { getNumberClaimTokenSecret } from "@/lib/twilio-provider";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    const body = await readJson(request) as { claimToken?: string; idempotencyKey?: string };
    if (!businessId || !body.claimToken) return NextResponse.json({ error: "businessId and claimToken are required." }, { status: 400 });
    const claimId = await reserveReplacementNumberClaim(createDomainContext(), { userId: session.user.id, businessId, claimToken: body.claimToken, claimTokenSecret: getNumberClaimTokenSecret(), idempotencyKey: body.idempotencyKey ?? randomUUID() });
    return NextResponse.json({ claimId }, { status: 202 });
  } catch (error) { return asApiResponse(error); }
}
