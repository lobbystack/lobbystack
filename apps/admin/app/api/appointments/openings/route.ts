import { NextResponse } from "next/server";

import { findBookingOpenings } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** The open times to book `serviceId` on `date`, a YYYY-MM-DD day in the business's timezone, optionally with `staffId` and a `durationMinutes` other than the service's. */
export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const params = new URL(request.url).searchParams;
  const serviceId = params.get("serviceId") ?? "";
  const staffId = params.get("staffId") || undefined;
  const date = params.get("date") ?? "";
  if (!isUuid(serviceId)) return jsonError("serviceId must be a UUID.", 400, "invalid_request");
  if (staffId && !isUuid(staffId)) return jsonError("staffId must be a UUID.", 400, "invalid_request");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError("date must be YYYY-MM-DD.", 400, "invalid_request");
  const duration = params.get("durationMinutes");
  if (duration !== null && !/^\d{1,4}$/.test(duration)) return jsonError("durationMinutes must be a whole number of minutes.", 400, "invalid_request");
  return NextResponse.json(await findBookingOpenings(domain, { userId, businessId, serviceId, date, ...(staffId ? { staffId } : {}), ...(duration !== null ? { durationMinutes: Number(duration) } : {}) }));
});
