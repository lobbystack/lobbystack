import { NextResponse } from "next/server";

import { bookAppointmentForOperator, BookingUnavailableError, listCurrentAppointments } from "@lobbystack/domain";
import { apiAppointmentCreateSchema, isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => ({ appointments: await listCurrentAppointments(tx, businessId, new Date()) }))));

const contactPhone = apiAppointmentCreateSchema.shape.contact_phone.unwrap();
const contactName = apiAppointmentCreateSchema.shape.contact_name.unwrap();

/**
 * An operator books an appointment from the dashboard for an existing contact
 * (`contactId`) or a new one (`contact: { name, phone }`). The domain requires
 * the scheduler role or above. A time that isn't open answers 409 slot_unavailable.
 */
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const serviceId = typeof body.serviceId === "string" ? body.serviceId : "";
  if (!isUuid(serviceId)) return jsonError("serviceId must be a UUID.", 400, "invalid_request");
  const staffId = typeof body.staffId === "string" && body.staffId ? body.staffId : undefined;
  if (staffId && !isUuid(staffId)) return jsonError("staffId must be a UUID.", 400, "invalid_request");
  const startsAt = typeof body.startsAt === "string" ? new Date(body.startsAt) : null;
  if (!startsAt || !Number.isFinite(startsAt.getTime())) return jsonError("startsAt must be a date and time.", 400, "invalid_request");
  if (startsAt.getTime() <= Date.now()) return jsonError("startsAt must be in the future.", 400, "invalid_request");
  let who: { contactId: string } | { contact: { name: string; phone: string } };
  if (typeof body.contactId === "string") {
    if (!isUuid(body.contactId)) return jsonError("contactId must be a UUID.", 400, "invalid_request");
    who = { contactId: body.contactId };
  } else {
    const contact = typeof body.contact === "object" && body.contact !== null ? body.contact as Record<string, unknown> : {};
    const name = contactName.safeParse(contact.name);
    const phone = contactPhone.safeParse(contact.phone);
    if (!name.success) return jsonError("contact.name is required.", 400, "invalid_request");
    if (!phone.success) return jsonError("contact.phone must be a phone number in E.164 format.", 400, "invalid_request");
    who = { contact: { name: name.data, phone: phone.data } };
  }
  try {
    const { appointmentId } = await bookAppointmentForOperator(domain, { userId, businessId, serviceId, startsAt: startsAt.toISOString(), ...(staffId ? { staffId } : {}), ...who });
    return NextResponse.json({ appointmentId }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingUnavailableError) return jsonError(error.message, 409, "slot_unavailable");
    throw error;
  }
});
