import { appointments, calls, contacts, messages } from "@lobbystack/db";
import { and, desc, eq, sql } from "drizzle-orm";

import { getAppPool, withDomainTransaction, type TransactionContext } from "./context";

export async function getDashboardSummary(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (_db, client) => {
      const result = await client.query<{
        calls_today: string;
        appointments: string;
        open_conversations: string;
        active_contacts: string;
      }>(
        `SELECT
          (SELECT count(*) FROM app.calls
            WHERE business_id = $1 AND started_at >= date_trunc('day', now())) AS calls_today,
          (SELECT count(*) FROM app.appointments
            WHERE business_id = $1 AND starts_at >= now()
              AND status NOT IN ('cancelled', 'no_show')) AS appointments,
          (SELECT count(*) FROM app.conversations
            WHERE business_id = $1 AND status = 'open') AS open_conversations,
          (SELECT count(*) FROM app.contacts
            WHERE business_id = $1) AS active_contacts`,
        [input.businessId],
      );

      const row = result.rows[0];
      return {
        callsToday: Number(row?.calls_today ?? 0),
        appointments: Number(row?.appointments ?? 0),
        openConversations: Number(row?.open_conversations ?? 0),
        activeContacts: Number(row?.active_contacts ?? 0),
      };
    },
  );
}

export async function listCalls(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (_db, client) => {
      const result = await client.query<{
        id: string;
        contactId: string | null;
        contactName: string | null;
        phoneE164: string | null;
        status: string;
        providerCallSid: string | null;
        startedAt: Date;
        endedAt: Date | null;
      }>(
        `SELECT
          c.id,
          c.contact_id AS "contactId",
          ct.display_name AS "contactName",
          ct.phone_e164 AS "phoneE164",
          c.status,
          c.provider_call_sid AS "providerCallSid",
          c.started_at AS "startedAt",
          c.ended_at AS "endedAt"
        FROM app.calls c
        LEFT JOIN app.contacts ct ON ct.id = c.contact_id
        WHERE c.business_id = $1
        ORDER BY c.started_at DESC NULLS LAST
        LIMIT 100`,
        [input.businessId],
      );

      return result.rows.map((row) => ({
        ...row,
        startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
        endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
      }));
    },
  );
}

export async function getContactDetail(input: {
  businessId: string;
  contactId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [contact] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId)))
        .limit(1);

      if (!contact) {
        return null;
      }

      const [messageCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.contactId)));

      const [callCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(calls)
        .where(and(eq(calls.businessId, input.businessId), eq(calls.contactId, input.contactId)));

      const [appointmentCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appointments)
        .where(
          and(eq(appointments.businessId, input.businessId), eq(appointments.contactId, input.contactId)),
        );

      const recentMessages = await db
        .select({ id: messages.id, body: messages.body, direction: messages.direction, createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.businessId, input.businessId))
        .orderBy(desc(messages.createdAt))
        .limit(5);

      return {
        ...contact,
        messageCount: messageCountRow?.count ?? 0,
        callCount: callCountRow?.count ?? 0,
        appointmentCount: appointmentCountRow?.count ?? 0,
        recentActivity: recentMessages.map((message) => ({
          kind: "message" as const,
          label: message.direction === "outbound" ? "Outgoing message" : "Incoming message",
          detail: message.body ?? "",
          occurredAt: message.createdAt.toISOString(),
        })),
      };
    },
  );
}
