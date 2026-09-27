import { NextResponse } from "next/server";

import { listOAuthGrants } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

/** Connected apps: the MCP clients an owner or admin authorized for the active business. */
export async function GET(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    return NextResponse.json({ grants: await listOAuthGrants(createDomainContext(), { userId: session.user.id, businessId }) });
  } catch (error) { return asApiResponse(error); }
}
