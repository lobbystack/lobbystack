import { calls, messages } from "@lobbystack/db";
import { and, eq, sql } from "drizzle-orm";

import { getWorkerPool, withDomainTransaction, type TransactionContext } from "./context";

export async function listDuePrivacyTargets(input: {
  businessId: string;
  now?: Date;
  pool?: TransactionContext["pool"];
}) {
  const now = input.now ?? new Date();

  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const messageRows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.businessId, input.businessId),
            sql`(${messages.metadataJson} ->> 'retentionStatus') = 'due'`,
          ),
        );

      const transcriptRows = await db
        .select({ callId: calls.id })
        .from(calls)
        .where(
          and(
            eq(calls.businessId, input.businessId),
            sql`(${calls.metadataJson} ->> 'transcriptRetentionDue')::timestamptz <= ${now.toISOString()}`,
          ),
        );

      return {
        messageIds: messageRows.map((row) => row.id),
        callIds: transcriptRows.map((row) => row.callId),
      };
    },
  );
}

export async function requestMessageScrub(input: {
  businessId: string;
  messageId: string;
  pool?: TransactionContext["pool"];
}) {
  const { enqueueSideEffect } = await import("./context");

  await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "privacy.scrubMessage",
        payload: { businessId: input.businessId, messageId: input.messageId },
        dedupeKey: `privacy:scrub:${input.messageId}`,
      });
    },
  );
}

export async function requestTranscriptDeletion(input: {
  businessId: string;
  callId: string;
  transcriptId?: string;
  pool?: TransactionContext["pool"];
}) {
  const { enqueueSideEffect } = await import("./context");

  await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "privacy.deleteTranscript",
        payload: {
          businessId: input.businessId,
          callId: input.callId,
          ...(input.transcriptId ? { transcriptId: input.transcriptId } : {}),
        },
        dedupeKey: `privacy:transcript:${input.callId}:${input.transcriptId ?? "all"}`,
      });
    },
  );
}
