import { NextResponse } from "next/server";

import { switchWorkspace } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { signedInRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const POST = signedInRoute(async ({ userId, businessId, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400);
  await switchWorkspace(domain, { userId, businessId });
  return NextResponse.json({ ok: true, businessId });
});
