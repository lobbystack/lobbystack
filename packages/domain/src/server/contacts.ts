import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { appointments, calls, contacts, conversations, enqueueOutbox, messages, services, staff, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

export async function listContacts(
  context: DomainContext,
  input: { userId: string; businessId: string; search?: string; limit?: number; offset?: number },
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 100);
    const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
    const search = input.search?.trim();
    const filter = and(eq(contacts.businessId, input.businessId), ...(search ? [or(ilike(contacts.name, `%${search}%`), ilike(contacts.phone, `%${search}%`), ilike(contacts.email, `%${search}%`))!] : []));
    const [rows, total] = await Promise.all([
      tx.select({
        id: contacts.id,
        name: contacts.name,
        phone: contacts.phone,
        email: contacts.email,
        timezone: contacts.timezone,
        preferredLocale: contacts.preferredLocale,
        smsConsentStatus: contacts.smsConsentStatus,
        smsConsentUpdatedAt: contacts.smsConsentUpdatedAt,
        smsConsentSource: contacts.smsConsentSource,
        operatorBlockedAt: contacts.operatorBlockedAt,
        createdAt: contacts.createdAt,
        updatedAt: contacts.updatedAt,
        callCount: sql<number>`(select count(*) from ${calls} where ${calls.contactId} = ${contacts.id} and ${calls.businessId} = ${input.businessId})`,
        messageCount: sql<number>`(select count(*) from ${messages} inner join ${conversations} on ${conversations.id} = ${messages.conversationId} where ${conversations.contactId} = ${contacts.id} and ${messages.businessId} = ${input.businessId})`,
        appointmentCount: sql<number>`(select count(*) from ${appointments} where ${appointments.contactId} = ${contacts.id} and ${appointments.businessId} = ${input.businessId})`,
      }).from(contacts).where(filter).orderBy(asc(contacts.name), asc(contacts.phone)).limit(limit + 1).offset(offset),
      tx.select({ count: count() }).from(contacts).where(filter),
    ]);
    return { contacts: rows.slice(0, limit), pagination: { limit, offset, total: Number(total[0]?.count ?? 0), hasNext: rows.length > limit } };
  });
}

export async function getContactDetail(
  context: DomainContext,
  input: { userId: string; businessId: string; contactId: string },
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const contact = (await tx.select().from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId))).limit(1))[0];
    if (!contact) return { contact: null, calls: [], messages: [], appointments: [], activityCounts: { calls: 0, messages: 0, appointments: 0 } };
    const [recentCalls, recentMessages, recentAppointments, callCount, messageCount, appointmentCount] = await Promise.all([
      tx.select({ id: calls.id, status: calls.status, disposition: calls.disposition, transport: calls.transport, startedAt: calls.startedAt, endedAt: calls.endedAt }).from(calls).where(and(eq(calls.businessId, input.businessId), eq(calls.contactId, input.contactId))).orderBy(desc(calls.startedAt)).limit(25),
      tx.select({ id: messages.id, conversationId: messages.conversationId, direction: messages.direction, channel: messages.channel, body: messages.body, status: messages.status, createdAt: messages.createdAt }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.businessId, input.businessId), eq(conversations.contactId, input.contactId))).where(eq(messages.businessId, input.businessId)).orderBy(desc(messages.createdAt)).limit(50),
      tx.select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, timezone: appointments.timezone, status: appointments.status, serviceName: services.name, staffName: staff.name }).from(appointments).innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, input.businessId))).innerJoin(staff, and(eq(staff.id, appointments.staffId), eq(staff.businessId, input.businessId))).where(and(eq(appointments.businessId, input.businessId), eq(appointments.contactId, input.contactId))).orderBy(desc(appointments.startsAt)).limit(25),
      tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, input.businessId), eq(calls.contactId, input.contactId))),
      tx.select({ count: count() }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.businessId, input.businessId), eq(conversations.contactId, input.contactId))).where(eq(messages.businessId, input.businessId)),
      tx.select({ count: count() }).from(appointments).where(and(eq(appointments.businessId, input.businessId), eq(appointments.contactId, input.contactId))),
    ]);
    return { contact, calls: recentCalls, messages: recentMessages, appointments: recentAppointments, activityCounts: { calls: Number(callCount[0]?.count ?? 0), messages: Number(messageCount[0]?.count ?? 0), appointments: Number(appointmentCount[0]?.count ?? 0) } };
  });
}

/** Contact deletion is an in-place anonymization so appointments and audit history remain referentially valid. */
export async function anonymizeContact(
  context: DomainContext,
  input: { userId: string; businessId: string; contactId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const phone = `deleted-${input.contactId.replaceAll("-", "").slice(0, 24)}`;
    const changed = await tx.update(contacts).set({ name: "Deleted contact", phone, email: null, timezone: null, preferredLocale: null, smsConsentStatus: "opted_out", smsConsentUpdatedAt: new Date(), smsConsentSource: "operator_anonymization", operatorBlockedAt: new Date(), updatedAt: new Date() }).where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId))).returning({ id: contacts.id });
    if (!changed.length) return false;
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "contact", aggregateId: input.contactId, dedupeKey: `contact:${input.contactId}:anonymized:${Date.now()}`, payload: { type: "conversation.updated", entityId: input.contactId } });
    return true;
  });
}
