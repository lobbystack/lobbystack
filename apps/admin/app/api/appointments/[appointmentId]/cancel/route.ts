import { NextResponse } from "next/server";

import { cancelAppointment } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/**
 * An operator cancels an appointment. The domain requires the scheduler role
 * or above, and closes callers' requests to cancel it.
 */
export const POST = operatorRoute<{ appointmentId: string }>(async ({ userId, businessId, domain }, { appointmentId }) => {
  if (!isUuid(appointmentId)) return jsonError("appointmentId must be a UUID.", 400, "invalid_request");
  const result = await cancelAppointment(domain, { userId, businessId, appointmentId });
  if (result === "already") return jsonError("This appointment is already cancelled.", 409, "already_cancelled");
  return NextResponse.json({ appointmentId, status: "canceled" });
});
