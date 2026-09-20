import { and, count, eq, isNull, lte } from "drizzle-orm";

import { outboxMessages, withBusinessTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";

/**
 * Counts a tenant's publishable outbox rows.
 *
 * This deliberately runs as the worker role inside a business transaction so
 * RLS scopes the read to `businessId`. The dispatcher role cannot write
 * `product_events`, and a global (null-business) aggregate cannot pass RLS, so
 * a tenant-scoped count is the only safe path for outbox backlog telemetry.
 *
 * "Publishable" matches the dispatcher's claim predicate: not yet published,
 * not dead-lettered, and available now. Locked rows are still counted because
 * they remain unpublished work.
 */
export async function countPublishableOutboxMessages(
  context: DomainContext,
  input: { businessId: string },
): Promise<number> {
  const [total] = await withBusinessTransaction(
    context.db,
    { businessId: input.businessId, actorType: "worker" },
    async (tx) =>
      await tx
        .select({ count: count() })
        .from(outboxMessages)
        .where(
          and(
            eq(outboxMessages.businessId, input.businessId),
            isNull(outboxMessages.publishedAt),
            isNull(outboxMessages.deadLetteredAt),
            lte(outboxMessages.availableAt, new Date()),
          ),
        ),
  );
  return Number(total?.count ?? 0);
}
