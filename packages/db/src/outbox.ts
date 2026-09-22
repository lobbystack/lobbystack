import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import type { TraceContextCarrier } from "@lobbystack/contracts";
import { redactOtelExceptionText } from "@lobbystack/telemetry/node";

import { withDispatcherTransaction, type DatabaseTransaction, type Database } from "./client";
import { outboxMessages } from "./schema";

export const OUTBOX_MAX_ATTEMPTS = 10;

export function shouldDeadLetterOutbox(attempts: number): boolean {
  return attempts >= OUTBOX_MAX_ATTEMPTS;
}

export type NewOutboxMessage = {
  topic: string;
  businessId?: string | undefined;
  aggregateType: string;
  aggregateId?: string | undefined;
  dedupeKey: string;
  payload: Record<string, unknown>;
  trace?: TraceContextCarrier | undefined;
  availableAt?: Date | undefined;
};

export async function enqueueOutbox(
  tx: DatabaseTransaction,
  input: NewOutboxMessage,
): Promise<string> {
  const [message] = await tx
    .insert(outboxMessages)
    .values({
      topic: input.topic,
      payload: input.payload,
      businessId: input.businessId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      dedupeKey: input.dedupeKey,
      availableAt: input.availableAt,
      traceparent: input.trace?.traceparent,
      tracestate: input.trace?.tracestate,
    })
    .onConflictDoNothing({ target: outboxMessages.dedupeKey })
    .returning({ id: outboxMessages.id });

  if (message) {
    return message.id;
  }

  const existing = await tx
    .select({ id: outboxMessages.id })
    .from(outboxMessages)
    .where(eq(outboxMessages.dedupeKey, input.dedupeKey))
    .limit(1);
  if (!existing[0]) {
    throw new Error("Outbox dedupe conflict could not be read back.");
  }
  return existing[0].id;
}

export type ClaimedOutboxMessage = typeof outboxMessages.$inferSelect;

export async function claimOutboxBatch(
  db: Database,
  options: { dispatcherId: string; limit?: number; lockForMs?: number } ,
): Promise<Array<ClaimedOutboxMessage>> {
  const limit = options.limit ?? 50;
  const lockForMs = options.lockForMs ?? 60_000;
  return await withDispatcherTransaction(db, async (tx) => {
    const rows = await tx
      .select()
      .from(outboxMessages)
      .where(
        and(
          isNull(outboxMessages.publishedAt),
          lte(outboxMessages.availableAt, new Date()),
          or(
            isNull(outboxMessages.lockedAt),
            lte(outboxMessages.lockedAt, new Date(Date.now() - lockForMs)),
          ),
          isNull(outboxMessages.deadLetteredAt),
        ),
      )
      .orderBy(asc(outboxMessages.availableAt), asc(outboxMessages.createdAt), asc(outboxMessages.id))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    // A fresh token on every claim prevents ABA even in the same millisecond.
    const lockedBy = `${options.dispatcherId.slice(0, 200)}:${randomUUID()}`;
    const claimed = await tx
      .update(outboxMessages)
      .set({ lockedAt: new Date(), lockedBy, attempts: sql`${outboxMessages.attempts} + 1` })
      .where(inArray(outboxMessages.id, ids)).returning();
    const byId = new Map(claimed.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id)!);
  });
}

export async function markOutboxPublished(
  db: Database,
  claim: Pick<ClaimedOutboxMessage, "id" | "lockedBy">,
): Promise<boolean> {
  if (!claim.lockedBy) return false;
  return await withDispatcherTransaction(db, async (tx) => {
    const rows = await tx.update(outboxMessages).set({ publishedAt: new Date(), lockedAt: null, lockedBy: null }).where(and(eq(outboxMessages.id, claim.id), eq(outboxMessages.lockedBy, claim.lockedBy!), isNull(outboxMessages.publishedAt), isNull(outboxMessages.deadLetteredAt))).returning({ id: outboxMessages.id });
    return rows.length > 0;
  });
}

export async function markOutboxFailed(
  db: Database,
  claim: Pick<ClaimedOutboxMessage, "id" | "lockedBy">,
  error: unknown,
  retryAt: Date,
): Promise<boolean> {
  if (!claim.lockedBy) return false;
  const message = redactOtelExceptionText(error instanceof Error ? error.message : String(error));
  return await withDispatcherTransaction(db, async (tx) => {
    const fence = and(eq(outboxMessages.id, claim.id), eq(outboxMessages.lockedBy, claim.lockedBy!), isNull(outboxMessages.publishedAt), isNull(outboxMessages.deadLetteredAt));
    const current = (await tx.select({ attempts: outboxMessages.attempts }).from(outboxMessages).where(fence).limit(1).for("update"))[0];
    if (!current) return false;
    const deadLettered = shouldDeadLetterOutbox(current.attempts);
    await tx
      .update(outboxMessages)
      .set({ availableAt: retryAt, lockedAt: null, lockedBy: null, lastError: message.slice(0, 2000), ...(deadLettered ? { deadLetteredAt: new Date() } : {}) })
      .where(fence);
    return deadLettered;
  });
}
