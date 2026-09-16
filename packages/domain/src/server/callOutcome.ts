import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { calls, contacts, conversations, conversationSessions, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";

export type CallOutcome =
  | { kind: "booked"; serviceName: string | null; startsAt: string }
  | { kind: "booking_in_progress"; serviceName: string | null; startsAt: string | null }
  | { kind: "message_taking"; summary?: string }
  | { kind: "summary"; summary: string }
  | { kind: "disposition"; disposition: string }
  | { kind: "none" };

export function resolveCallOutcome(input: { persisted?: Record<string, unknown> | null | undefined; currentIntent?: string | null; summary?: string | null; disposition?: string | null }): CallOutcome {
  const persisted = input.persisted;
  if (persisted?.kind === "booked" && typeof persisted.startsAt === "string" && Number.isFinite(Date.parse(persisted.startsAt))) return { kind: "booked", serviceName: typeof persisted.serviceName === "string" ? persisted.serviceName : null, startsAt: persisted.startsAt };
  if (persisted?.kind === "booking_in_progress") return { kind: "booking_in_progress", serviceName: typeof persisted.serviceName === "string" ? persisted.serviceName : null, startsAt: typeof persisted.startsAt === "string" && Number.isFinite(Date.parse(persisted.startsAt)) ? persisted.startsAt : null };
  if (persisted?.kind === "message_taking" || input.currentIntent === "message_taking") return { kind: "message_taking" };
  const summary = (persisted?.kind === "summary" && typeof persisted.summary === "string" ? persisted.summary : input.summary)?.trim();
  if (summary && !/^Business .* conversation$/u.test(summary) && summary !== input.disposition) return { kind: "summary", summary };
  const disposition = (persisted?.kind === "disposition" && typeof persisted.disposition === "string" ? persisted.disposition : input.disposition)?.trim();
  return disposition ? { kind: "disposition", disposition } : { kind: "none" };
}

/** Store factual outcomes in the same transaction as the booking or follow-up. */
export async function recordCallOutcomeInTransaction(tx: DatabaseTransaction, input: { businessId: string; callId: string; outcome: CallOutcome; contactId?: string }) {
  const [call] = await tx.select({ conversationId: calls.conversationId, contactId: calls.contactId, startedAt: calls.startedAt, transport: calls.transport }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1).for("update");
  if (!call) throw new Error("Call does not belong to this booking contact.");
  if (input.contactId && call.contactId !== input.contactId) {
    // A browser caller has no phone until booking. Only replace that anonymous
    // association; an already identified caller must still match the booking.
    const [anonymous] = call.transport === "web_voice" && call.contactId
      ? await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, call.contactId), eq(contacts.businessId, input.businessId), isNull(contacts.phone))).limit(1).for("update")
      : [];
    const [bookingContact] = anonymous
      ? await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId), isNotNull(contacts.phone))).limit(1)
      : [];
    if (!bookingContact) throw new Error("Call does not belong to this booking contact.");
    await tx.update(calls).set({ contactId: bookingContact.id, updatedAt: new Date() }).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId)));
    if (call.conversationId) {
      await tx.update(conversations).set({ contactId: bookingContact.id, updatedAt: new Date() }).where(and(eq(conversations.id, call.conversationId), eq(conversations.businessId, input.businessId)));
    }
  }
  if (!call.conversationId) return;
  await tx.insert(conversationSessions).values({ businessId: input.businessId, conversationId: call.conversationId, callId: input.callId, channel: "voice", startedAt: call.startedAt, summaryKind: input.outcome.kind, summary: input.outcome })
    .onConflictDoUpdate({ target: conversationSessions.callId, targetWhere: isNotNull(conversationSessions.callId), set: { summaryKind: input.outcome.kind, summary: input.outcome, updatedAt: new Date() }, ...(input.outcome.kind !== "booked" ? { setWhere: or(isNull(conversationSessions.summaryKind), ne(conversationSessions.summaryKind, "booked"))! } : {}) });
}

/** Remember a caller's scheduling request without presenting an offered slot as booked. */
export async function recordCallSchedulingProgress(context: DomainContext, input: { businessId: string; callId: string; serviceName: string; startsAt?: string }) {
  if (input.startsAt && !Number.isFinite(Date.parse(input.startsAt))) throw new Error("A valid appointment time is required.");
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await recordCallOutcomeInTransaction(tx, { businessId: input.businessId, callId: input.callId, outcome: { kind: "booking_in_progress", serviceName: input.serviceName, startsAt: input.startsAt ?? null } });
  });
}
