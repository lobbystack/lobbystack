import { and, asc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";

import { appointments, contacts, services, staff } from "@lobbystack/db";
import { listAppointmentsInRange } from "@lobbystack/domain";
import { asApiResponse, jsonError, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // `from` and `to` (ISO times) ask for a calendar range; without them, upcoming appointments.
    const params = new URL(request.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    if (from || to) {
      const range = { from: new Date(from ?? ""), to: new Date(to ?? "") };
      if (!Number.isFinite(range.from.getTime()) || !Number.isFinite(range.to.getTime())) return jsonError("from and to must be ISO times.", 400, "invalid_request");
      return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => ({
        appointments: await listAppointmentsInRange(createDomainContext(), { userId: session.user.id, businessId, ...range }),
      })));
    }
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const rows = await tx.select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        timezone: appointments.timezone,
        status: appointments.status,
        sourceChannel: appointments.sourceChannel,
        calendarSyncState: appointments.calendarSyncState,
        contactName: contacts.name,
        serviceName: services.name,
        staffName: staff.name,
      })
        .from(appointments)
        .innerJoin(contacts, eq(contacts.id, appointments.contactId))
        .innerJoin(services, eq(services.id, appointments.serviceId))
        .innerJoin(staff, eq(staff.id, appointments.staffId))
        .where(and(eq(appointments.businessId, businessId), gte(appointments.endsAt, new Date())))
        .orderBy(asc(appointments.startsAt))
        .limit(100);
      return { appointments: rows };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
