import { NextResponse } from "next/server";

import { listPartnerAccess } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// The business's Partner access tab: each time someone on its partner's team
// opened it or left it, newest first. Its owners and admins read it.
export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json({
  events: await transaction(async (tx) => await listPartnerAccess(tx, { businessId }), { minimumRole: "business_admin" }),
}));
