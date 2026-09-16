import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

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
      .limit(limit)
      .for("update", { skipLocked: true });

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    await tx
      .update(outboxMessages)
      .set({ lockedAt: new Date(), lockedBy: options.dispatcherId, attempts: sql`${outboxMessages.attempts} + 1` })
      .where(inArray(outboxMessages.id, ids));
    return rows.map((row) => ({ ...row, lockedAt: new Date(), lockedBy: options.dispatcherId, attempts: row.attempts + 1 }));
  });
}

export async function markOutboxPublished(
  db: Database,
  id: string,
): Promise<void> {
  await withDispatcherTransaction(db, async (tx) => {
    await tx.update(outboxMessages).set({ publishedAt: new Date(), lockedAt: null, lockedBy: null }).where(eq(outboxMessages.id, id));
  });
}

export async function markOutboxFailed(
  db: Database,
  id: string,
  error: unknown,
  retryAt: Date,
): Promise<boolean> {
  const message = redactOtelExceptionText(error instanceof Error ? error.message : String(error));
  return await withDispatcherTransaction(db, async (tx) => {
    const current = (await tx.select({ attempts: outboxMessages.attempts }).from(outboxMessages).where(eq(outboxMessages.id, id)).limit(1))[0];
    const deadLettered = shouldDeadLetterOutbox(current?.attempts ?? OUTBOX_MAX_ATTEMPTS);
    await tx
      .update(outboxMessages)
      .set({ availableAt: retryAt, lockedAt: null, lockedBy: null, lastError: message.slice(0, 2000), ...(deadLettered ? { deadLetteredAt: new Date() } : {}) })
      .where(eq(outboxMessages.id, id));
    return deadLettered;
  });
}
