import { contacts, conversations, messages, phoneNumbers, smsConsentEvents, smsConsentStates } from "@lobbystack/db";
import type { SendSmsReplyRequest } from "@lobbystack/contracts";
import {
  mapTwilioStatusToMessageStatus,
  shouldApplyMessageStatusTransition,
} from "@lobbystack/shared";
import { and, eq } from "drizzle-orm";

import {
  enqueueSideEffect,
  getDispatcherPool,
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";
import { createOutboundMessage, upsertContact } from "./messages";

const STOP_KEYWORDS = new Set(["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_KEYWORDS = new Set(["START", "UNSTOP", "YES"]);

function keyword(body: string, optOutType?: string): string {
  return (optOutType ?? body).trim().toUpperCase();
}

async function resolveBusinessByPhone(
  client: import("pg").PoolClient,
  phone: string,
): Promise<string | null> {
  const result = await client.query<{ business_id: string }>(
    `SELECT business_id::text
     FROM app.phone_numbers
     WHERE e164 = $1 AND is_active = true
     LIMIT 1`,
    [phone],
  );

  return result.rows[0]?.business_id ?? null;
}

export async function recordInboundSms(input: {
  to: string;
  from: string;
  body: string;
  providerMessageId?: string;
  optOutType?: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db, client) => {
      const businessId = await resolveBusinessByPhone(client, input.to);
      if (!businessId) {
        throw new Error("No active business is mapped to the inbound SMS number");
      }

      await client.query(`SELECT set_config('app.business_id', $1, true)`, [businessId]);

      const normalizedKeyword = keyword(input.body, input.optOutType);
      if (STOP_KEYWORDS.has(normalizedKeyword)) {
        await recordSmsConsent(db, {
          businessId,
          phoneE164: input.from,
          status: "revoked",
          action: "opt_out",
          ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
        });
        return { businessId, handled: "opt_out" as const };
      }

      if (START_KEYWORDS.has(normalizedKeyword)) {
        await recordSmsConsent(db, {
          businessId,
          phoneE164: input.from,
          status: "granted",
          action: "opt_in",
          ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
        });
        return { businessId, handled: "opt_in" as const };
      }

      if (input.providerMessageId) {
        const [existing] = await db
          .select({ id: messages.id, conversationId: messages.conversationId })
          .from(messages)
          .where(eq(messages.providerMessageId, input.providerMessageId))
          .limit(1);

        if (existing) {
          return {
            businessId,
            handled: "duplicate" as const,
            messageId: existing.id,
            conversationId: existing.conversationId,
          };
        }
      }

      const contact = await upsertContact({
        businessId,
        phoneE164: input.from,
        pool: input.pool,
      });

      let [conversation] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.businessId, businessId),
            eq(conversations.contactId, contact.id),
            eq(conversations.channel, "sms"),
            eq(conversations.status, "open"),
          ),
        )
        .limit(1);

      if (!conversation) {
        [conversation] = await db
          .insert(conversations)
          .values({
            businessId,
            contactId: contact.id,
            channel: "sms",
            status: "open",
            lastMessageAt: new Date(),
          })
          .returning({ id: conversations.id });
      }

      if (!conversation) {
        throw new Error("Conversation could not be created");
      }

      const [message] = await db
        .insert(messages)
        .values({
          businessId,
          conversationId: conversation.id,
          direction: "inbound",
          senderRole: "contact",
          body: input.body,
          status: "delivered",
          ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
          sentAt: new Date(),
          deliveredAt: new Date(),
        })
        .returning({ id: messages.id });

      if (!message) {
        throw new Error("Inbound SMS was not persisted");
      }

      await enqueueSideEffect(db, {
        businessId,
        topic: "message.upserted",
        payload: { businessId, entityId: message.id },
        dedupeKey: `message:${message.id}:inbound`,
      });

      return {
        businessId,
        handled: "message" as const,
        messageId: message.id,
        conversationId: conversation.id,
        contactId: contact.id,
      };
    },
  );
}

async function recordSmsConsent(
  db: import("./context").DomainDb,
  input: {
    businessId: string;
    phoneE164: string;
    status: string;
    action: string;
    providerMessageId?: string;
  },
) {
  const [state] = await db
    .insert(smsConsentStates)
    .values({
      businessId: input.businessId,
      phoneE164: input.phoneE164,
      recipientType: "customer",
      scope: "transactional",
      status: input.status,
      source: "twilio",
      consentedAt: input.status === "granted" ? new Date() : undefined,
      revokedAt: input.status === "revoked" ? new Date() : undefined,
    })
    .onConflictDoNothing()
    .returning({ id: smsConsentStates.id });

  const consentStateId =
    state?.id ??
    (
      await db
        .select({ id: smsConsentStates.id })
        .from(smsConsentStates)
        .where(
          and(
            eq(smsConsentStates.businessId, input.businessId),
            eq(smsConsentStates.phoneE164, input.phoneE164),
          ),
        )
        .limit(1)
    )[0]?.id;

  if (!consentStateId) {
    return;
  }

  await db.insert(smsConsentEvents).values({
    businessId: input.businessId,
    consentStateId,
    action: input.action,
    actorType: "system",
    payloadJson: input.providerMessageId ? { providerMessageId: input.providerMessageId } : {},
    occurredAt: new Date(),
  });
}

export async function sendSmsReply(input: {
  values: SendSmsReplyRequest;
  pool?: TransactionContext["pool"];
}) {
  return createOutboundMessage({
    businessId: input.values.businessId,
    conversationId: input.values.conversationId,
    body: input.values.body,
    pool: input.pool,
  });
}

export async function reconcileSmsStatus(input: {
  providerMessageId: string;
  providerStatus: string;
  providerUpdatedAt: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) => {
      const [message] = await db
        .select({ id: messages.id, businessId: messages.businessId, status: messages.status })
        .from(messages)
        .where(eq(messages.providerMessageId, input.providerMessageId))
        .limit(1);

      if (!message) {
        return false;
      }

      const nextStatus = mapTwilioStatusToMessageStatus(input.providerStatus);
      if (!shouldApplyMessageStatusTransition(message.status, nextStatus)) {
        return false;
      }

      await db
        .update(messages)
        .set({
          status: nextStatus,
          ...(nextStatus === "delivered" ? { deliveredAt: new Date(input.providerUpdatedAt) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(messages.id, message.id));

      await enqueueSideEffect(db, {
        businessId: message.businessId,
        topic: "message.deliveryUpdated",
        payload: { businessId: message.businessId, entityId: message.id },
        dedupeKey: `message:${message.id}:status:${nextStatus}`,
      });

      return true;
    },
  );
}

export async function listSmsNumbers(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getWorkerPool() },
    async (db) =>
      db
        .select()
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.isActive, true))),
  );
}
