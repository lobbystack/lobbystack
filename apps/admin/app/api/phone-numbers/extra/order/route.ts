import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { orderExtraNumberClaim, type NumberSelection } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { assignedNumberProvider } from "@/lib/assigned-number-provider";
import { getNumberClaimTokenSecret, requireNumberSearch } from "@/lib/telephony";
import { assertPhoneNumberSearchAllowed } from "@/lib/phone-number-search-limit";

// Gives an extra number for one of the business's agents in a city, for a country whose carrier names the number when
// it takes the order. The order is charged at once, so the plan, the add-on and the agent are checked first.
export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = input as { selection?: Partial<NumberSelection>; idempotencyKey?: unknown; agentId?: unknown };
  if (typeof body.agentId !== "string" || !body.agentId) return jsonError("agentId is required.", 400);
  requireNumberSearch();
  await assertPhoneNumberSearchAllowed({ userId, initial: false });
  const claimId = await orderExtraNumberClaim(domain, { userId, businessId, agentId: body.agentId, selection: body.selection ?? {}, claimTokenSecret: getNumberClaimTokenSecret(), idempotencyKey: typeof body.idempotencyKey === "string" && body.idempotencyKey ? body.idempotencyKey : randomUUID() }, assignedNumberProvider());
  return NextResponse.json({ claimId }, { status: 202 });
});
