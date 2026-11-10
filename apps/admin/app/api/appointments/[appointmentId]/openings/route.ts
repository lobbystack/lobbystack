import { NextResponse } from "next/server";

import { findRescheduleOpenings } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** The open times an appointment can move to on `date`, a YYYY-MM-DD day in the business's timezone. */
export const GET = operatorRoute<{ appointmentId: string }>(async ({ request, userId, businessId, domain }, { appointmentId }) => {
  if (!isUuid(appointmentId)) return jsonError("appointmentId must be a UUID.", 400, "invalid_request");
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError("date must be YYYY-MM-DD.", 400, "invalid_request");
  return NextResponse.json(await findRescheduleOpenings(domain, { userId, businessId, appointmentId, date }));
});
