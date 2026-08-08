import { calls, callTranscripts, contacts, conversations } from "@lobbystack/db";
import type {
  AppendTranscriptRequest,
  CompleteCallRequest,
  StartVoiceCallRequest,
} from "@lobbystack/contracts";
import { and, eq } from "drizzle-orm";

import {
  enqueueSideEffect,
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

export async function startVoiceCall(input: {
  values: StartVoiceCallRequest;
  pool?: TransactionContext["pool"];
}) {
  const { values } = input;

  return withDomainTransaction(
    { businessId: values.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [existing] = await db
        .select({
          callId: calls.id,
          contactId: calls.contactId,
          conversationId: calls.conversationId,
        })
        .from(calls)
        .where(eq(calls.providerCallSid, values.twilioCallSid))
        .limit(1);

      if (existing?.callId && existing.contactId && existing.conversationId) {
        return {
          callId: existing.callId,
          contactId: existing.contactId,
          conversationId: existing.conversationId,
        };
      }

      let [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.businessId, values.businessId),
            eq(contacts.phoneE164, values.from),
          ),
        )
        .limit(1);

      if (!contact) {
        [contact] = await db
          .insert(contacts)
          .values({
            businessId: values.businessId,
            phoneE164: values.from,
          })
          .returning({ id: contacts.id });
      }

      if (!contact) {
        throw new Error("Unable to create call contact");
      }

      const [conversation] = await db
        .insert(conversations)
        .values({
          businessId: values.businessId,
          contactId: contact.id,
          channel: "voice",
          status: "open",
          lastMessageAt: new Date(values.startedAt),
        })
        .returning({ id: conversations.id });

      if (!conversation) {
        throw new Error("Unable to create call conversation");
      }

      const [call] = await db
        .insert(calls)
        .values({
          businessId: values.businessId,
          contactId: contact.id,
          conversationId: conversation.id,
          direction: "inbound",
          status: "in_progress",
          fromE164: values.from,
          toE164: values.to,
          providerCallSid: values.twilioCallSid,
          startedAt: new Date(values.startedAt),
          metadataJson: values.gatewaySessionId
            ? { gatewaySessionId: values.gatewaySessionId }
            : undefined,
        })
        .returning({ id: calls.id });

      if (!call) {
        const [conflict] = await db
          .select({ id: calls.id, contactId: calls.contactId, conversationId: calls.conversationId })
          .from(calls)
          .where(eq(calls.providerCallSid, values.twilioCallSid))
          .limit(1);

        if (!conflict) {
          throw new Error("Unable to create call");
        }

        return {
          callId: conflict.id,
          contactId: conflict.contactId ?? contact.id,
          conversationId: conflict.conversationId ?? conversation.id,
        };
      }

      await enqueueSideEffect(db, {
        businessId: values.businessId,
        topic: "call.started",
        payload: { businessId: values.businessId, entityId: call.id },
        dedupeKey: `call:${call.id}:started`,
      });

      return {
        callId: call.id,
        contactId: contact.id,
        conversationId: conversation.id,
      };
    },
  );
}

export async function appendVoiceTranscript(input: {
  values: AppendTranscriptRequest;
  pool?: TransactionContext["pool"];
}) {
  const { values } = input;

  await withDomainTransaction(
    { businessId: values.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [existingTranscript] = await db
        .select({ id: callTranscripts.id })
        .from(callTranscripts)
        .where(
          and(
            eq(callTranscripts.callId, values.callId),
            eq(callTranscripts.sequence, values.sequence),
          ),
        )
        .limit(1);

      const [transcript] = existingTranscript
        ? await db
            .update(callTranscripts)
            .set({
              speaker: values.speaker,
              text: values.text,
              confidence:
                values.confidence !== undefined
                  ? Math.round(values.confidence * 100)
                  : undefined,
              metadataJson: { final: values.final },
              updatedAt: new Date(),
            })
            .where(eq(callTranscripts.id, existingTranscript.id))
            .returning({ id: callTranscripts.id })
        : await db
            .insert(callTranscripts)
            .values({
              businessId: values.businessId,
              callId: values.callId,
              sequence: values.sequence,
              speaker: values.speaker,
              text: values.text,
              confidence:
                values.confidence !== undefined
                  ? Math.round(values.confidence * 100)
                  : undefined,
              metadataJson: { final: values.final },
            })
            .returning({ id: callTranscripts.id });

      if (!transcript) {
        throw new Error("Unable to persist transcript");
      }

      await enqueueSideEffect(db, {
        businessId: values.businessId,
        topic: "transcript.upserted",
        payload: { businessId: values.businessId, entityId: transcript.id },
        dedupeKey: `transcript:${values.callId}:${values.sequence}`,
      });
    },
  );
}

export async function completeVoiceCall(input: {
  businessId: string;
  values: CompleteCallRequest;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [call] = await db
        .update(calls)
        .set({
          status: input.values.status,
          endedAt: new Date(input.values.endedAt),
          ...(input.values.disposition ? { disposition: input.values.disposition } : {}),
          ...(input.values.providerDurationSeconds !== undefined
            ? { durationSeconds: input.values.providerDurationSeconds }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(calls.id, input.values.callId), eq(calls.businessId, input.businessId)))
        .returning({
          id: calls.id,
          providerCallSid: calls.providerCallSid,
          startedAt: calls.startedAt,
        });

      if (!call) {
        throw new Error("Call was not found in the active business");
      }

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "call.completed",
        payload: { businessId: input.businessId, entityId: call.id },
        dedupeKey: `call:${call.id}:completed`,
      });

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "call.syncPrice",
        payload: {
          businessId: input.businessId,
          callId: call.id,
          providerCallId: call.providerCallSid ?? "",
        },
        dedupeKey: `call:${call.id}:price`,
      });

      const durationSeconds =
        input.values.providerDurationSeconds ??
        (call.startedAt
          ? Math.max(
              0,
              Math.round(
                (new Date(input.values.endedAt).getTime() - call.startedAt.getTime()) / 1_000,
              ),
            )
          : 0);

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "billing.recordUsage",
        payload: {
          businessId: input.businessId,
          usageKind: "voice_seconds",
          quantity: durationSeconds,
          sourceKey: `voice:${call.providerCallSid ?? call.id}`,
          recordedAt: input.values.endedAt,
        },
        dedupeKey: `billing.voice:${call.id}`,
      });
    },
  );
}

export async function getCallForBusiness(input: {
  businessId: string;
  callId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [call] = await db
        .select({
          id: calls.id,
          conversationId: calls.conversationId,
          contactId: calls.contactId,
        })
        .from(calls)
        .where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId)))
        .limit(1);

      return call ?? null;
    },
  );
}

export async function deleteVoiceTranscript(input: {
  businessId: string;
  callId: string;
  transcriptId?: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const deleted = await db
        .delete(callTranscripts)
        .where(
          and(
            eq(callTranscripts.businessId, input.businessId),
            eq(callTranscripts.callId, input.callId),
            ...(input.transcriptId ? [eq(callTranscripts.id, input.transcriptId)] : []),
          ),
        )
        .returning({ id: callTranscripts.id });

      return deleted.length;
    },
  );
}
