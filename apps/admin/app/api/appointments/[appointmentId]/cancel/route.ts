import { NextResponse } from "next/server";

import { cancelAppointment } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { asApiResponse, jsonError, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

/**
 * An operator cancels an appointment. The domain requires the scheduler role
 * or above, and closes callers' requests to cancel it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { appointmentId } = await params;
    if (!isUuid(appointmentId)) return jsonError("appointmentId must be a UUID.", 400, "invalid_request");
    const result = await cancelAppointment(createDomainContext(), { userId: session.user.id, businessId, appointmentId });
    if (result === "already") return jsonError("This appointment is already cancelled.", 409, "already_cancelled");
    return NextResponse.json({ appointmentId, status: "canceled" });
  } catch (error) {
    return asApiResponse(error);
  }
}
