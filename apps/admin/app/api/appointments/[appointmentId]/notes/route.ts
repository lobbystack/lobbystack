import { NextResponse } from "next/server";

import { updateAppointmentNotes } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const text = (value: unknown) => value === null || value === undefined ? null : typeof value === "string" ? value : undefined;

/**
 * Saves an appointment's `notes` (the agent can read them to a verified
 * caller) and `internalNotes` (staff only). Empty text clears them. The
 * domain requires the scheduler role or above.
 */
export const PUT = operatorRoute<{ appointmentId: string }>(async ({ userId, businessId, body, domain }, { appointmentId }) => {
  if (!isUuid(appointmentId)) return jsonError("appointmentId must be a UUID.", 400, "invalid_request");
  const notes = text(body.notes);
  const internalNotes = text(body.internalNotes);
  if (notes === undefined || internalNotes === undefined) return jsonError("notes and internalNotes must be text.", 400, "invalid_request");
  if (!await updateAppointmentNotes(domain, { userId, businessId, appointmentId, notes, internalNotes })) return jsonError("Appointment not found.", 404, "not_found");
  return NextResponse.json({ appointmentId });
});
