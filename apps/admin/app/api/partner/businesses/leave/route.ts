import { NextResponse } from "next/server";

import { currentPartnerOpen, leavePartnerBusiness } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { signedInRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// The person's own open of a partner's business. GET says when the running
// one began, which the dashboard reads as it loads. POST ends it when they go
// back to the console or sign out: with openedAt, only the open that began
// then, so a newer one another tab started stays. The business's audit log
// records when they left. It only ever touches the caller's own open, so it
// needs no partner role.
export const GET = signedInRoute(async ({ userId, businessId, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400, "business_required");
  const open = await currentPartnerOpen(domain, { userId, businessId });
  return NextResponse.json({ openedAt: open?.openedAt.toISOString() ?? null });
});

export const POST = signedInRoute(async ({ userId, businessId, body, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400, "business_required");
  const openedAt = typeof body.openedAt === "string" ? new Date(body.openedAt) : undefined;
  if (openedAt && Number.isNaN(openedAt.getTime())) return jsonError("openedAt must be a date.", 400, "invalid_request");
  return NextResponse.json(await leavePartnerBusiness(domain, { userId, businessId, openedAt }));
});
