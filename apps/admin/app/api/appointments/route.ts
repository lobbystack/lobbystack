import { and, asc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";

import { appointments, contacts, services, staff } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
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
