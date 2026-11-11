import { NextResponse } from "next/server";

import { listTimeOffBetween, MAX_APPOINTMENT_RANGE_DAYS, saveTimeOff } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

import { readTimeOff, serializeTimeOff } from "./fields";

export const dynamic = "force-dynamic";

/**
 * The business's closures and employees' time off that overlap `from`–`to`
 * (ISO instants), for the appointments calendar. Any member can read them,
 * as they can read the hours.
 */
export const GET = operatorRoute(async ({ request, businessId, transaction }) => {
  const params = new URL(request.url).searchParams;
  const [from, to] = [params.get("from"), params.get("to")].map((value) => value ? new Date(value) : null);
  if (!from || !to || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) return jsonError("from and to must be dates, with to after from.", 400, "invalid_request");
  if (to.getTime() - from.getTime() > MAX_APPOINTMENT_RANGE_DAYS * 86_400_000) return jsonError(`from and to can be at most ${MAX_APPOINTMENT_RANGE_DAYS} days apart.`, 400, "invalid_request");
  return NextResponse.json(await transaction(async (tx) => ({ timeOff: (await listTimeOffBetween(tx, businessId, from, to)).map(serializeTimeOff) })));
});

/** Adds a closure of the whole business or an employee's time off. The domain requires the admin role, as the hours and employee editors do. */
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const saved = await saveTimeOff(domain, { userId, businessId, ...readTimeOff(body) });
  if (!saved) return jsonError("Time off could not be saved.", 500);
  return NextResponse.json({ timeOff: serializeTimeOff(saved) }, { status: 201 });
});
