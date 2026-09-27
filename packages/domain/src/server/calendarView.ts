import { and, asc, eq, gt, lt, ne } from "drizzle-orm";

import { appointments, contacts, services, staff, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

export type CalendarAppointment = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  status: string;
  sourceChannel: string;
  contactName: string | null;
  contactPhone: string | null;
  serviceName: string;
  staffId: string;
  staffName: string;
};

const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

/**
 * Appointments that overlap `[from, to)` for the business calendar, whichever
 * receptionist booked them. Canceled ones are left out unless asked for.
 */
export async function listAppointmentsInRange(
  context: DomainContext,
  input: { userId: string; businessId: string; from: Date; to: Date; includeCanceled?: boolean },
): Promise<CalendarAppointment[]> {
  if (!(input.from < input.to) || input.to.getTime() - input.from.getTime() > MAX_RANGE_MS) {
    throw Object.assign(new Error("Choose a range of up to two months."), { status: 400, code: "calendar_range_invalid" });
  }
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return await tx.select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      timezone: appointments.timezone,
      status: appointments.status,
      sourceChannel: appointments.sourceChannel,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      serviceName: services.name,
      staffId: appointments.staffId,
      staffName: staff.name,
    }).from(appointments)
      .innerJoin(contacts, eq(contacts.id, appointments.contactId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .innerJoin(staff, eq(staff.id, appointments.staffId))
      .where(and(
        eq(appointments.businessId, input.businessId),
        lt(appointments.startsAt, input.to),
        gt(appointments.endsAt, input.from),
        ...(input.includeCanceled ? [] : [ne(appointments.status, "canceled")]),
      ))
      .orderBy(asc(appointments.startsAt))
      .limit(500);
  });
}
