import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api-helpers";
import { createInstagramOAuthState, enforceInstagramOAuthRateLimits, instagramConfigured, instagramProvider, storeInstagramOAuthState } from "@/lib/instagram-oauth";
import { operatorRoute } from "@/lib/operator-request";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ request, userId, businessId, transaction }) => {
  await transaction(async () => undefined, { minimumRole: "business_admin" });
  if (!instagramConfigured()) return jsonError("Instagram isn't set up on this server.", 503, "instagram_not_configured");
  const rate = await enforceInstagramOAuthRateLimits({ operation: "start", userId, businessId, ip: trustedClientIp(request) });
  if (!rate.allowed) return jsonError("Too many Instagram authorization attempts. Please try again later.", rate.status, "instagram_oauth_rate_limited");
  const state = createInstagramOAuthState({ userId, businessId });
  await storeInstagramOAuthState(state);
  const forceReauth = new URL(request.url).searchParams.get("switch") === "1";
  return NextResponse.json({ url: instagramProvider().buildAuthorizationUrl({ state, forceReauth }) });
});
