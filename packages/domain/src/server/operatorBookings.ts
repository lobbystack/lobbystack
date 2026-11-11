import { and, eq, sql } from "drizzle-orm";

import { appointments, businesses, contacts, enqueueOutbox, services, withBusinessTransaction } from "@lobbystack/db";

import { BookingUnavailableError, type NoOpeningsReason } from "../availability";
import { requireBusinessMembership } from "../authz";
import { appointmentNotes, findOpeningsInTransaction } from "./booking";
import type { DomainContext } from "./context";
import { bookForCaller } from "./receptionistActions";

function serviceUnavailable(): Error {
  return Object.assign(new Error("Service is not available."), { status: 409, code: "service_unavailable" });
}

/**
 * The times an operator can book a service on one local day (YYYY-MM-DD in the
 * business's timezone), optionally with one staff member. Takes the scheduler
 * role or above, like moving an appointment.
 */
export async function findBookingOpenings(
  context: DomainContext,
  input: { userId: string; businessId: string; serviceId: string; date: string; staffId?: string | undefined; durationMinutes?: number | undefined },
): Promise<{ timezone: string; durationMinutes: number; openings: string[]; reason?: NoOpeningsReason }> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId, minimumRole: "scheduler" });
    const [service] = await tx.select({ id: services.id }).from(services).where(and(eq(services.businessId, input.businessId), eq(services.id, input.serviceId), eq(services.active, true))).limit(1);
    if (!service) throw serviceUnavailable();
    const found = await findOpeningsInTransaction(tx, { businessId: input.businessId, serviceId: service.id, dates: [input.date], ...(input.staffId ? { staffId: input.staffId } : {}), ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}) });
    return { timezone: found.timezone, durationMinutes: found.durationMinutes, openings: found.openings, ...(found.reason ? { reason: found.reason } : {}) };
  });
}

/**
 * An operator books an appointment from the dashboard, for an existing contact
 * or for a new one by name and phone. It goes through the same booking as
 * calls and the API, so availability, the confirmation and reminder texts,
 * calendar sync, webhooks and telemetry follow, with the dashboard as the
 * channel and the operator in the audit log. Takes the scheduler role or
 * above. The business's booking mode doesn't apply: it governs the
 * receptionist, and the operator is the business. A time that isn't open
 * throws BookingUnavailableError.
 */
export async function bookAppointmentForOperator(
  context: DomainContext,
  input: { userId: string; businessId: string; serviceId: string; startsAt: string; staffId?: string | undefined; durationMinutes?: number | undefined; notes?: string | undefined; internalNotes?: string | undefined } & ({ contactId: string; contact?: undefined } | { contact: { name: string; phone: string }; contactId?: undefined }),
): Promise<{ appointmentId: string }> {
  const prepared = await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId, minimumRole: "scheduler" });
    const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business) throw Object.assign(new Error("Business not found."), { status: 404, code: "not_found" });
    if (input.contact) return { timezone: business.timezone, contactPhone: input.contact.phone, contactName: input.contact.name };
    const [contact] = await tx.select({ phone: contacts.phone }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.id, input.contactId))).limit(1);
    if (!contact) throw Object.assign(new Error("Contact not found."), { status: 404, code: "not_found" });
    // Booking texts the confirmation and reminders, and finds the contact by phone.
    if (!contact.phone) throw Object.assign(new Error("This contact has no phone number."), { status: 400, code: "contact_no_phone" });
    return { timezone: business.timezone, contactPhone: contact.phone };
  });
  const booked = await bookForCaller(context, {
    businessId: input.businessId,
    service: { id: input.serviceId },
    startsAt: input.startsAt,
    timezone: prepared.timezone,
    contactPhone: prepared.contactPhone,
    channel: "dashboard",
    operatorUserId: input.userId,
    ...(prepared.contactName ? { contactName: prepared.contactName } : {}),
    ...(input.staffId ? { preferredStaffId: input.staffId } : {}),
    ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.internalNotes ? { internalNotes: input.internalNotes } : {}),
  });
  if (!booked.ok) throw booked.reason === "unknown_service" ? serviceUnavailable() : new BookingUnavailableError(booked.reason);
  return { appointmentId: booked.appointmentId! };
}

/**
 * Saves an appointment's notes from the dashboard. `notes` can reach the agent
 * once a caller is verified, and the public API and webhooks; `internalNotes`
 * stay in the dashboard. Takes the scheduler role or above. Returns false when
 * the appointment isn't the business's.
 */
export async function updateAppointmentNotes(
  context: DomainContext,
  input: { userId: string; businessId: string; appointmentId: string; notes: string | null; internalNotes: string | null },
): Promise<boolean> {
  const notes = appointmentNotes(input.notes);
  const internalNotes = appointmentNotes(input.internalNotes);
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId, minimumRole: "scheduler" });
    const [updated] = await tx.update(appointments)
      .set({ notes, internalNotes, revision: sql`${appointments.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(appointments.businessId, input.businessId), eq(appointments.id, input.appointmentId)))
      .returning({ id: appointments.id, revision: appointments.revision });
    if (!updated) return false;
    // Open dashboards refresh; the payload names the appointment, never its notes.
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "appointment", aggregateId: updated.id, dedupeKey: `appointment:${updated.id}:updated:${updated.revision}`, payload: { type: "appointment.updated", entityId: updated.id, revision: updated.revision } });
    return true;
  });
}
