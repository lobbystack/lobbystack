import { NextResponse } from "next/server";

import { releaseBusiness } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// Releases one of the partner's businesses to its owner, who keeps it on the
// host's Free plan. The partner operation checks the actor's role and that
// the owner accepted their invitation.
export const POST = partnerRoute(async ({ actor, businessId, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400, "business_required");
  await releaseBusiness(domain, actor, { businessId });
  return NextResponse.json({ ok: true });
});
