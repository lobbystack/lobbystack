import { NextResponse } from "next/server";

import { confirmCallForwardingInTransaction } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// The owner says forwarding works after the test call. Some carriers strip
// the header that would tell us, so this finishes Getting started's step.
export const POST = operatorRoute(async ({ businessId, transaction }) => {
  const confirmed = await transaction(async (tx) => await confirmCallForwardingInTransaction(tx, { businessId }), { minimumRole: "business_admin" });
  if (!confirmed) return jsonError("This workspace has no active phone number.", 409);
  return NextResponse.json({ confirmed: true });
});
