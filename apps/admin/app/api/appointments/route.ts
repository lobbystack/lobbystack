import { NextResponse } from "next/server";

import { bookAppointmentForOperator, BookingUnavailableError, listAppointmentsBetween, listCurrentAppointments, MAX_APPOINTMENT_RANGE_DAYS } from "@lobbystack/domain";
import { apiAppointmentCreateSchema, isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/**
 * Without a range: what hasn't ended and what ended in the last month, without
 * cancellations, for the list and the sidebar badge. With `from` and `to`
 * (ISO instants, at most MAX_APPOINTMENT_RANGE_DAYS apart): everything that
 * overlaps them, cancellations included, for the calendar.
 */
export const GET = operatorRoute(async ({ request, businessId, transaction }) => {
  const params = new URL(request.url).searchParams;
  if (!params.has("from") && !params.has("to")) return NextResponse.json(await transaction(async (tx) => ({ appointments: await listCurrentAppointments(tx, businessId, new Date()) })));
  const [from, to] = [params.get("from"), params.get("to")].map((value) => value ? new Date(value) : null);
  if (!from || !to || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) return jsonError("from and to must be dates, with to after from.", 400, "invalid_request");
  if (to.getTime() - from.getTime() > MAX_APPOINTMENT_RANGE_DAYS * 86_400_000) return jsonError(`from and to can be at most ${MAX_APPOINTMENT_RANGE_DAYS} days apart.`, 400, "invalid_request");
  return NextResponse.json(await transaction(async (tx) => ({ appointments: await listAppointmentsBetween(tx, businessId, from, to) })));
});

const optionalText = (value: unknown) => typeof value === "string" ? value : undefined;

const contactPhone = apiAppointmentCreateSchema.shape.contact_phone.unwrap();
const contactName = apiAppointmentCreateSchema.shape.contact_name.unwrap();

/**
 * An operator books an appointment from the dashboard for an existing contact
 * (`contactId`) or a new one (`contact: { name, phone }`), optionally with a
 * `durationMinutes` other than the service's, `notes` and `internalNotes`.
 * The domain requires the scheduler role or above. A time that isn't open answers 409 slot_unavailable.
 */
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const serviceId = typeof body.serviceId === "string" ? body.serviceId : "";
  if (!isUuid(serviceId)) return jsonError("serviceId must be a UUID.", 400, "invalid_request");
  const staffId = typeof body.staffId === "string" && body.staffId ? body.staffId : undefined;
  if (staffId && !isUuid(staffId)) return jsonError("staffId must be a UUID.", 400, "invalid_request");
  const startsAt = typeof body.startsAt === "string" ? new Date(body.startsAt) : null;
  if (!startsAt || !Number.isFinite(startsAt.getTime())) return jsonError("startsAt must be a date and time.", 400, "invalid_request");
  if (startsAt.getTime() <= Date.now()) return jsonError("startsAt must be in the future.", 400, "invalid_request");
  const durationMinutes = body.durationMinutes === undefined || body.durationMinutes === null ? undefined : body.durationMinutes;
  if (durationMinutes !== undefined && (typeof durationMinutes !== "number" || !Number.isInteger(durationMinutes))) return jsonError("durationMinutes must be a whole number of minutes.", 400, "invalid_request");
  if ((body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") || (body.internalNotes !== undefined && body.internalNotes !== null && typeof body.internalNotes !== "string")) return jsonError("notes and internalNotes must be text.", 400, "invalid_request");
  const notes = optionalText(body.notes);
  const internalNotes = optionalText(body.internalNotes);
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
    const { appointmentId } = await bookAppointmentForOperator(domain, { userId, businessId, serviceId, startsAt: startsAt.toISOString(), ...(staffId ? { staffId } : {}), ...(durationMinutes !== undefined ? { durationMinutes } : {}), ...(notes ? { notes } : {}), ...(internalNotes ? { internalNotes } : {}), ...who });
    return NextResponse.json({ appointmentId }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingUnavailableError) return jsonError(error.message, 409, "slot_unavailable");
    throw error;
  }
});
