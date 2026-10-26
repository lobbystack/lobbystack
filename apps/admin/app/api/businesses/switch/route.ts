import { NextResponse } from "next/server";

import { switchWorkspace } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { signedInRoute } from "@/lib/operator-request";
import { requestBrandScope } from "@/lib/request-brand";

export const dynamic = "force-dynamic";

// Opens a business of this domain's brand only.
export const POST = signedInRoute(async ({ request, userId, businessId, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400);
  await switchWorkspace(domain, { userId, businessId, brand: requestBrandScope(request.headers) });
  return NextResponse.json({ ok: true, businessId });
});
