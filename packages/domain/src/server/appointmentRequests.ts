import { and, eq, inArray, sql } from "drizzle-orm";

import { appointments, inboxItems, withBusinessTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";
import { APPOINTMENT_REQUESTS } from "./voice";

/**
 * Marks done every open request to cancel or move an appointment that has
 * started by `now`, since there is nothing left to change. A request linked
 * to no appointment, or to one in another business,
 * stays open: only the team can tell what it meant. The worker runs this on
 * the business's calendar schedule.
 */
export async function closePassedAppointmentRequests(context: DomainContext, input: { businessId: string; now?: Date }): Promise<{ closed: number }> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const closed = await tx.update(inboxItems).set({ status: "done", updatedAt: now }).where(and(
      eq(inboxItems.businessId, input.businessId),
      eq(inboxItems.kind, "voice_message"),
      eq(inboxItems.status, "open"),
      inArray(sql<string>`${inboxItems.metadata}->>'request'`, [...APPOINTMENT_REQUESTS]),
      // Compared as text: metadata is free-form JSON, and a bad id must not fail the sweep.
      sql`exists (select 1 from ${appointments} where ${appointments.businessId} = ${input.businessId} and ${appointments.id}::text = ${inboxItems.metadata}->>'appointmentId' and ${appointments.startsAt} <= ${now})`,
    )).returning({ id: inboxItems.id });
    return { closed: closed.length };
  });
}
