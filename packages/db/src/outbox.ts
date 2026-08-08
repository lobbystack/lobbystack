import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { z } from "zod";

import { outboxMessages } from "./schema/operations";
import type { schema } from "./schema";

export const outboxStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "dead",
]);

export type OutboxStatus = z.infer<typeof outboxStatusSchema>;

export const outboxMessageInputSchema = z.object({
  businessId: z.string().uuid(),
  topic: z.string().min(1),
  payload: z.record(z.unknown()),
  availableAt: z.date().optional(),
  dedupeKey: z.string().optional(),
});

export type OutboxMessageInput = z.infer<typeof outboxMessageInputSchema>;

type Db = NodePgDatabase<typeof schema>;

export async function enqueueOutboxMessage(
  db: Db,
  input: OutboxMessageInput,
): Promise<string> {
  const parsed = outboxMessageInputSchema.parse(input);

  const [row] = await db
    .insert(outboxMessages)
    .values({
      businessId: parsed.businessId,
      topic: parsed.topic,
      payloadJson: parsed.payload,
      availableAt: parsed.availableAt ?? new Date(),
      dedupeKey: parsed.dedupeKey,
      status: "pending",
    })
    .onConflictDoNothing({ target: outboxMessages.dedupeKey })
    .returning({ id: outboxMessages.id });

  if (!row) {
    if (!parsed.dedupeKey) {
      throw new Error("Failed to enqueue outbox message");
    }

    const existing = await db
      .select({ id: outboxMessages.id })
      .from(outboxMessages)
      .where(eq(outboxMessages.dedupeKey, parsed.dedupeKey))
      .limit(1);

    const existingId = existing[0]?.id;
    if (!existingId) {
      throw new Error("Failed to resolve deduplicated outbox message");
    }

    return existingId;
  }

  return row.id;
}

export async function claimOutboxBatch(
  db: Db,
  options: {
    workerId: string;
    limit?: number;
    topics?: string[];
  },
): Promise<Array<typeof outboxMessages.$inferSelect>> {
  const limit = options.limit ?? 25;
  const now = new Date();

  const conditions = [
    eq(outboxMessages.status, "pending"),
    lte(outboxMessages.availableAt, now),
    or(isNull(outboxMessages.lockedAt), lte(outboxMessages.lockedAt, now)),
  ];

  if (options.topics && options.topics.length > 0) {
    conditions.push(
      sql`${outboxMessages.topic} = ANY(${sql.param(options.topics)})`,
    );
  }

  const claimed = await db
    .update(outboxMessages)
    .set({
      status: "processing",
      lockedAt: now,
      lockedBy: options.workerId,
      attempts: sql`${outboxMessages.attempts} + 1`,
      updatedAt: now,
    })
    .where(and(...conditions))
    .returning();

  return claimed.slice(0, limit);
}

export async function completeOutboxMessage(
  db: Db,
  messageId: string,
): Promise<void> {
  await db
    .update(outboxMessages)
    .set({
      status: "completed",
      processedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(outboxMessages.id, messageId));
}

export async function failOutboxMessage(
  db: Db,
  messageId: string,
  errorMessage: string,
  options?: { dead?: boolean; retryAt?: Date },
): Promise<void> {
  await db
    .update(outboxMessages)
    .set({
      status: options?.dead ? "dead" : "pending",
      lastError: errorMessage,
      availableAt: options?.retryAt ?? new Date(),
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(outboxMessages.id, messageId));
}

export async function enqueueOutboxMessageWithClient(
  client: PoolClient,
  input: OutboxMessageInput,
): Promise<string> {
  const parsed = outboxMessageInputSchema.parse(input);

  const result = await client.query<{ id: string }>(
    `INSERT INTO app.outbox_messages (
      business_id,
      topic,
      payload_json,
      status,
      available_at,
      dedupe_key
    ) VALUES ($1, $2, $3::jsonb, 'pending', COALESCE($4, NOW()), $5)
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id`,
    [
      parsed.businessId,
      parsed.topic,
      JSON.stringify(parsed.payload),
      parsed.availableAt ?? null,
      parsed.dedupeKey ?? null,
    ],
  );

  const insertedId = result.rows[0]?.id;
  if (insertedId) {
    return insertedId;
  }

  if (!parsed.dedupeKey) {
    throw new Error("Failed to enqueue outbox message");
  }

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM app.outbox_messages WHERE dedupe_key = $1 LIMIT 1`,
    [parsed.dedupeKey],
  );

  const existingId = existing.rows[0]?.id;
  if (!existingId) {
    throw new Error("Failed to resolve deduplicated outbox message");
  }

  return existingId;
}
