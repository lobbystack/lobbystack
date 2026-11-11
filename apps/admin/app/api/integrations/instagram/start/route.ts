import { NextResponse } from "next/server";

import { requireActiveAgentInTransaction } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";

import { jsonError } from "@/lib/api-helpers";
import { createInstagramOAuthState, enforceInstagramOAuthRateLimits, instagramConfigured, instagramProvider, storeInstagramOAuthState } from "@/lib/instagram-oauth";
import { operatorRoute } from "@/lib/operator-request";
import { partnerRequestOrigin } from "@/lib/request-brand";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?agentId= names the agent the account will answer as. Without it, the account keeps its agent, or a new one gets the default agent.
export const GET = operatorRoute(async ({ request, userId, businessId, transaction }) => {
  const agentId = new URL(request.url).searchParams.get("agentId") ?? undefined;
  if (agentId !== undefined && !isUuid(agentId)) return jsonError("agentId must be a UUID.", 400, "invalid_request");
  await transaction(async (tx) => {
    if (agentId) await requireActiveAgentInTransaction(tx, businessId, agentId);
  }, { minimumRole: "business_admin" });
  if (!instagramConfigured()) return jsonError("Instagram isn't set up on this server.", 503, "instagram_not_configured");
  const rate = await enforceInstagramOAuthRateLimits({ operation: "start", userId, businessId, ip: trustedClientIp(request) });
  if (!rate.allowed) return jsonError("Too many Instagram authorization attempts. Please try again later.", rate.status, "instagram_oauth_rate_limited");
  // Instagram returns to the host's domain, which hands the callback back to a partner's host it started on.
  const state = createInstagramOAuthState({ userId, businessId, agentId, origin: partnerRequestOrigin(request.headers) });
  await storeInstagramOAuthState(state);
  const forceReauth = new URL(request.url).searchParams.get("switch") === "1";
  return NextResponse.json({ url: instagramProvider().buildAuthorizationUrl({ state, forceReauth }) });
});
