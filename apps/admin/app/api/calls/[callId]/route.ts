import { NextResponse } from "next/server";

import { completeVoiceFollowUpTasks, getCallDetail } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute<{ callId: string }>(async ({ userId, businessId, domain }, { callId }) => {
  // A malformed id would make Postgres throw on the uuid comparison.
  const detail = isUuid(callId) ? await getCallDetail(domain, { userId, businessId, callId }) : null;
  if (!detail) return NextResponse.json({ error: "Call not found.", code: "not_found" }, { status: 404 });
  return NextResponse.json(detail);
});

export const PATCH = operatorRoute<{ callId: string }>(async ({ userId, businessId, body, domain }, { callId }) => {
  if (body.action !== "complete_follow_up") return jsonError("action must be complete_follow_up.", 400);
  // With inboxItemId, only that follow-up; without, every one on the call.
  const { inboxItemId } = body;
  if (inboxItemId !== undefined && !isUuid(inboxItemId)) return jsonError("inboxItemId must be a UUID.", 400, "invalid_request");
  if (!isUuid(callId)) return jsonError("Call not found.", 404, "not_found");
  return NextResponse.json(await completeVoiceFollowUpTasks(domain, { userId, businessId, callId, ...(inboxItemId ? { inboxItemId } : {}) }));
});
