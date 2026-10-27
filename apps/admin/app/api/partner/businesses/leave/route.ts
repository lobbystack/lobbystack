import { NextResponse } from "next/server";

import { leavePartnerBusiness } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { signedInRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// Ends the person's own open of a partner's business when they go back to the
// console from it. The business's audit log records when they left. It only
// ever touches the caller's own open, so it needs no partner role.
export const POST = signedInRoute(async ({ userId, businessId, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400, "business_required");
  return NextResponse.json(await leavePartnerBusiness(domain, { userId, businessId }));
});
