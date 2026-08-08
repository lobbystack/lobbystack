import { contacts, conversations, messages } from "@lobbystack/db";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  enqueueSideEffect,
  getAppPool,
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export async function listConversationSummaries(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db, client) => {
      const result = await client.query<{
        id: string;
        contactId: string;
        channel: string;
        status: string;
        contactName: string | null;
        contactPhone: string | null;
        contactEmail: string | null;
        messageCount: number;
        lastMessageBody: string | null;
        lastMessageDirection: string | null;
        lastMessageStatus: string | null;
        lastMessageAt: Date;
      }>(
        `SELECT
          c.id,
          c.contact_id AS "contactId",
          c.channel,
          c.status,
          ct.display_name AS "contactName",
          ct.phone_e164 AS "contactPhone",
          ct.email AS "contactEmail",
          COALESCE(stats.message_count, 0)::int AS "messageCount",
          latest.body AS "lastMessageBody",
          latest.direction AS "lastMessageDirection",
          latest.status AS "lastMessageStatus",
          latest.created_at AS "lastMessageAt"
        FROM app.conversations c
        JOIN app.contacts ct ON ct.id = c.contact_id
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS message_count
          FROM app.messages m
          WHERE m.conversation_id = c.id
        ) stats ON true
        LEFT JOIN LATERAL (
          SELECT m.body, m.direction, m.status, m.created_at
          FROM app.messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) latest ON true
        WHERE c.business_id = $1
          AND latest.body IS NOT NULL
        ORDER BY latest.created_at DESC, c.id DESC
        LIMIT 100`,
        [input.businessId],
      );

      return result.rows.map((row) => ({
        ...row,
        messageCount: Number(row.messageCount),
        lastMessageAt: toIso(row.lastMessageAt),
      }));
    },
  );
}

export async function getConversationThread(input: {
  businessId: string;
  conversationId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db, client) => {
      const conversationResult = await client.query<{
        id: string;
        contactId: string;
        channel: string;
        status: string;
        contactName: string | null;
        contactPhone: string | null;
        contactEmail: string | null;
      }>(
        `SELECT
          c.id,
          c.contact_id AS "contactId",
          c.channel,
          c.status,
          ct.display_name AS "contactName",
          ct.phone_e164 AS "contactPhone",
          ct.email AS "contactEmail"
        FROM app.conversations c
        JOIN app.contacts ct ON ct.id = c.contact_id
        WHERE c.business_id = $1 AND c.id = $2
        LIMIT 1`,
        [input.businessId, input.conversationId],
      );

      const row = conversationResult.rows[0];
      if (!row) {
        return null;
      }

      const messagesResult = await client.query<{
        id: string;
        direction: string;
        body: string | null;
        deliveryStatus: string;
        createdAt: Date;
      }>(
        `SELECT
          id,
          direction,
          body,
          status AS "deliveryStatus",
          created_at AS "createdAt"
        FROM app.messages
        WHERE business_id = $1 AND conversation_id = $2
        ORDER BY created_at ASC, id ASC
        LIMIT 500`,
        [input.businessId, input.conversationId],
      );

      return {
        conversation: {
          id: row.id,
          contactId: row.contactId,
          channel: row.channel,
          status: row.status,
        },
        contact: {
          id: row.contactId,
          name: row.contactName,
          phone: row.contactPhone,
          email: row.contactEmail,
        },
        messages: messagesResult.rows.map((message) => ({
          ...message,
          createdAt: toIso(message.createdAt),
        })),
      };
    },
  );
}

export async function finalizeConversation(input: {
  businessId: string;
  conversationId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [conversation] = await db
        .update(conversations)
        .set({ status: "closed", updatedAt: new Date() })
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.businessId, input.businessId),
          ),
        )
        .returning({ id: conversations.id });

      if (!conversation) {
        return false;
      }

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "conversation.updated",
        payload: { businessId: input.businessId, entityId: conversation.id },
        dedupeKey: `conversation:${conversation.id}:finalized`,
      });

      return true;
    },
  );
}

export async function scrubMessage(input: {
  businessId: string;
  messageId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [message] = await db
        .update(messages)
        .set({
          body: "[redacted]",
          metadataJson: { retentionStatus: "scrubbed" },
          updatedAt: new Date(),
        })
        .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId)))
        .returning({ id: messages.id });

      return Boolean(message);
    },
  );
}

export async function createOutboundMessage(input: {
  businessId: string;
  conversationId: string;
  body: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [message] = await db
        .insert(messages)
        .values({
          businessId: input.businessId,
          conversationId: input.conversationId,
          direction: "outbound",
          senderRole: "operator",
          body: input.body,
          status: "queued",
          sentAt: new Date(),
        })
        .returning({ id: messages.id });

      if (!message) {
        throw new Error("Message was not created");
      }

      await db
        .update(conversations)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "sms.send",
        payload: { businessId: input.businessId, messageId: message.id },
        dedupeKey: `sms:${message.id}:send`,
      });

      return message;
    },
  );
}

export async function upsertContact(input: {
  businessId: string;
  phoneE164?: string;
  displayName?: string;
  email?: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      if (input.phoneE164) {
        const [existing] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            and(
              eq(contacts.businessId, input.businessId),
              eq(contacts.phoneE164, input.phoneE164),
            ),
          )
          .limit(1);

        if (existing) {
          return existing;
        }
      }

      const [created] = await db
        .insert(contacts)
        .values({
          businessId: input.businessId,
          ...(input.phoneE164 ? { phoneE164: input.phoneE164 } : {}),
          ...(input.displayName ? { displayName: input.displayName } : {}),
          ...(input.email ? { email: input.email } : {}),
        })
        .returning({ id: contacts.id });

      if (!created) {
        throw new Error("Contact could not be created");
      }

      return created;
    },
  );
}

export async function listRecentMessages(input: {
  businessId: string;
  limit?: number;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(messages)
        .where(eq(messages.businessId, input.businessId))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit ?? 50),
  );
}
