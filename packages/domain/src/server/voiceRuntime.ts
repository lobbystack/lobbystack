import { calls } from "@lobbystack/db";
import { and, eq } from "drizzle-orm";

import {
  enqueueSideEffect,
  getDispatcherPool,
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

export async function resolveBusinessByCallId(input: {
  callId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) => {
      const [call] = await db
        .select({ businessId: calls.businessId })
        .from(calls)
        .where(eq(calls.id, input.callId))
        .limit(1);

      return call?.businessId ?? null;
    },
  );
}

export async function resolveBusinessByProviderCallId(input: {
  providerCallId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) => {
      const [call] = await db
        .select({ businessId: calls.businessId })
        .from(calls)
        .where(eq(calls.providerCallSid, input.providerCallId))
        .limit(1);

      return call?.businessId ?? null;
    },
  );
}

export async function setVoiceTransferState(input: {
  businessId: string;
  callId: string;
  transferState: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [call] = await db
        .select({ id: calls.id, metadataJson: calls.metadataJson })
        .from(calls)
        .where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId)))
        .limit(1);

      if (!call) {
        throw new Error("Call not found");
      }

      const metadata =
        typeof call.metadataJson === "object" && call.metadataJson !== null
          ? (call.metadataJson as Record<string, unknown>)
          : {};

      await db
        .update(calls)
        .set({
          metadataJson: { ...metadata, transferState: input.transferState },
          updatedAt: new Date(),
        })
        .where(eq(calls.id, input.callId));

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "call.updated",
        payload: { businessId: input.businessId, entityId: input.callId },
        dedupeKey: `call:${input.callId}:transfer:${input.transferState}`,
      });

      return { callId: input.callId, transferState: input.transferState };
    },
  );
}

export async function recordVoiceAiCost(input: {
  businessId: string;
  callId: string;
  costUsd: number;
  provider: string;
  model: string;
  occurredAt: string;
  eventKey: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "billing.recordUsage",
        payload: {
          businessId: input.businessId,
          usageKind: "voice_seconds",
          quantity: 0,
          sourceKey: input.eventKey,
          recordedAt: input.occurredAt,
          metadata: {
            callId: input.callId,
            costUsd: input.costUsd,
            provider: input.provider,
            model: input.model,
          },
        },
        dedupeKey: `voice-ai-cost:${input.eventKey}`,
      });
    },
  );
}
