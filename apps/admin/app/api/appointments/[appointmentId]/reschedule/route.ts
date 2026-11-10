import { NextResponse } from "next/server";

import { BookingUnavailableError, rescheduleAppointment } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/**
 * An operator moves an appointment to a new time, for example the one a caller asked for.
 * The domain requires the scheduler role or above, checks the time is bookable, and
 * closes callers' requests to move the appointment.
 */
export const POST = operatorRoute<{ appointmentId: string }>(async ({ userId, businessId, body, domain }, { appointmentId }) => {
  if (!isUuid(appointmentId)) return jsonError("appointmentId must be a UUID.", 400, "invalid_request");
  const startsAt = typeof body.startsAt === "string" ? new Date(body.startsAt) : null;
  if (!startsAt || !Number.isFinite(startsAt.getTime())) return jsonError("startsAt must be a date and time.", 400, "invalid_request");
  if (startsAt.getTime() <= Date.now()) return jsonError("startsAt must be in the future.", 400, "invalid_request");
  try {
    const moved = await rescheduleAppointment(domain, { userId, businessId, appointmentId, startsAt: startsAt.toISOString() });
    if (!moved) return jsonError("This appointment can't be rescheduled. It may be cancelled.", 409, "not_reschedulable");
    return NextResponse.json({ appointmentId, startsAt: moved.startsAt.toISOString() });
  } catch (error) {
    if (error instanceof BookingUnavailableError) return jsonError(error.message, 409, "slot_unavailable");
    throw error;
  }
});
