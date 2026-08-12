import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { appointments, calls, contacts, conversations, messages, services, staff } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ contactId: string }> }) {
  try {
    const { contactId } = await context.params;
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const contact = (await tx.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.businessId, businessId))).limit(1))[0];
      if (!contact) return { contact: null, calls: [], messages: [], appointments: [] };
      const recentCalls = await tx.select({ id: calls.id, status: calls.status, disposition: calls.disposition, transport: calls.transport, startedAt: calls.startedAt, endedAt: calls.endedAt }).from(calls).where(and(eq(calls.businessId, businessId), eq(calls.contactId, contactId))).orderBy(desc(calls.startedAt)).limit(25);
      const recentMessages = await tx.select({ id: messages.id, conversationId: messages.conversationId, direction: messages.direction, channel: messages.channel, body: messages.body, status: messages.status, createdAt: messages.createdAt }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.businessId, businessId), eq(conversations.contactId, contactId))).where(eq(messages.businessId, businessId)).orderBy(desc(messages.createdAt)).limit(50);
      const recentAppointments = await tx.select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, timezone: appointments.timezone, status: appointments.status, serviceName: services.name, staffName: staff.name }).from(appointments).innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, businessId))).innerJoin(staff, and(eq(staff.id, appointments.staffId), eq(staff.businessId, businessId))).where(and(eq(appointments.businessId, businessId), eq(appointments.contactId, contactId))).orderBy(desc(appointments.startsAt)).limit(25);
      return { contact, calls: recentCalls, messages: recentMessages, appointments: recentAppointments };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
