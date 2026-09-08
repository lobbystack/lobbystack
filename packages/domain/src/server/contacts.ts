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
    // Match the original contact activity order; profile edits are not interactions.
    const lastInteractionAt = sql<Date>`greatest(
      ${contacts.createdAt},
      (select max("activity_calls"."started_at") from "calls" as "activity_calls" where "activity_calls"."contact_id" = "contacts"."id" and "activity_calls"."business_id" = ${input.businessId}),
      (select max("activity_messages"."created_at") from "messages" as "activity_messages" inner join "conversations" as "activity_conversations" on "activity_conversations"."id" = "activity_messages"."conversation_id" where "activity_conversations"."contact_id" = "contacts"."id" and "activity_messages"."business_id" = ${input.businessId}),
      (select max("activity_appointments"."starts_at") from "appointments" as "activity_appointments" where "activity_appointments"."contact_id" = "contacts"."id" and "activity_appointments"."business_id" = ${input.businessId} and "activity_appointments"."starts_at" <= now())
    )`;
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
        lastInteractionAt,
        callCount: sql<number>`(select count(*) from "calls" as "contact_calls" where "contact_calls"."contact_id" = "contacts"."id" and "contact_calls"."business_id" = ${input.businessId})`,
        messageCount: sql<number>`(select count(*) from "messages" as "contact_messages" inner join "conversations" as "contact_conversations" on "contact_conversations"."id" = "contact_messages"."conversation_id" where "contact_conversations"."contact_id" = "contacts"."id" and "contact_messages"."business_id" = ${input.businessId})`,
        appointmentCount: sql<number>`(select count(*) from "appointments" as "contact_appointments" where "contact_appointments"."contact_id" = "contacts"."id" and "contact_appointments"."business_id" = ${input.businessId})`,
      }).from(contacts).where(filter).orderBy(desc(lastInteractionAt), asc(contacts.id)).limit(limit + 1).offset(offset),
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
    if (!contact) return { contact: null, calls: [], messages: [], appointments: [], activityCounts: { calls: 0, messages: 0, appointments: 0, conversations: 0 } };
    const [recentCalls, recentMessages, recentAppointments, callCount, messageCount, appointmentCount, conversationCount] = await Promise.all([
      tx.select({ id: calls.id, status: calls.status, disposition: calls.disposition, transport: calls.transport, startedAt: calls.startedAt, endedAt: calls.endedAt, providerDurationSeconds: calls.providerDurationSeconds }).from(calls).where(and(eq(calls.businessId, input.businessId), eq(calls.contactId, input.contactId))).orderBy(desc(calls.startedAt)).limit(25),
      tx.select({ id: messages.id, conversationId: messages.conversationId, direction: messages.direction, channel: messages.channel, body: messages.body, status: messages.status, createdAt: messages.createdAt }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.businessId, input.businessId), eq(conversations.contactId, input.contactId))).where(eq(messages.businessId, input.businessId)).orderBy(desc(messages.createdAt)).limit(50),
      tx.select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, timezone: appointments.timezone, status: appointments.status, sourceChannel: appointments.sourceChannel, calendarSyncState: appointments.calendarSyncState, serviceName: services.name, staffName: staff.name }).from(appointments).innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, input.businessId))).innerJoin(staff, and(eq(staff.id, appointments.staffId), eq(staff.businessId, input.businessId))).where(and(eq(appointments.businessId, input.businessId), eq(appointments.contactId, input.contactId))).orderBy(desc(appointments.startsAt)).limit(25),
      tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, input.businessId), eq(calls.contactId, input.contactId))),
      tx.select({ count: count() }).from(messages).innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.businessId, input.businessId), eq(conversations.contactId, input.contactId))).where(eq(messages.businessId, input.businessId)),
      tx.select({ count: count() }).from(appointments).where(and(eq(appointments.businessId, input.businessId), eq(appointments.contactId, input.contactId))),
      tx.select({ count: count() }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.contactId, input.contactId))),
    ]);
    return { contact, calls: recentCalls, messages: recentMessages, appointments: recentAppointments, activityCounts: { calls: Number(callCount[0]?.count ?? 0), messages: Number(messageCount[0]?.count ?? 0), appointments: Number(appointmentCount[0]?.count ?? 0), conversations: Number(conversationCount[0]?.count ?? 0) } };
  });
}

/** The dashboard can delete standalone contacts; linked history must remain intact. */
export async function deleteContact(
  context: DomainContext,
  input: { userId: string; businessId: string; contactId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async tx => {
    await requireBusinessAdmin(tx, input);
    const contact = (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId))).limit(1).for("update"))[0];
    if (!contact) return false;
    const [linkedCalls, linkedConversations, linkedAppointments] = await Promise.all([
      tx.select({ id: calls.id }).from(calls).where(and(eq(calls.businessId, input.businessId), eq(calls.contactId, input.contactId))).limit(1),
      tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.contactId, input.contactId))).limit(1),
      tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.businessId, input.businessId), eq(appointments.contactId, input.contactId))).limit(1),
    ]);
    if (linkedCalls.length || linkedConversations.length || linkedAppointments.length) {
      throw Object.assign(new Error("This contact can't be deleted because it still has linked conversations or appointments."), { status: 409 });
    }
    await tx.delete(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId)));
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "contact", aggregateId: input.contactId, dedupeKey: `contact:${input.contactId}:deleted`, payload: { type: "conversation.updated", entityId: input.contactId } });
    return true;
  });
}

/** Explicit anonymization preserves referentially valid appointment and audit history. */
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
