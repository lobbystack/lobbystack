import { NextResponse } from "next/server";

import { deleteTimeOff, saveTimeOff } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

import { readTimeOff, serializeTimeOff } from "../fields";

export const dynamic = "force-dynamic";

/** Changes a time off. The domain requires the admin role. */
export const PUT = operatorRoute<{ timeOffId: string }>(async ({ userId, businessId, body, domain }, { timeOffId }) => {
  if (!isUuid(timeOffId)) return jsonError("timeOffId must be a UUID.", 400, "invalid_request");
  const saved = await saveTimeOff(domain, { userId, businessId, id: timeOffId, ...readTimeOff(body) });
  if (!saved) return jsonError("Time off not found.", 404, "not_found");
  return NextResponse.json({ timeOff: serializeTimeOff(saved) });
});

export const DELETE = operatorRoute<{ timeOffId: string }>(async ({ userId, businessId, domain }, { timeOffId }) => {
  if (!isUuid(timeOffId)) return jsonError("timeOffId must be a UUID.", 400, "invalid_request");
  if (!await deleteTimeOff(domain, { userId, businessId, id: timeOffId })) return jsonError("Time off not found.", 404, "not_found");
  return NextResponse.json({ timeOffId });
});
