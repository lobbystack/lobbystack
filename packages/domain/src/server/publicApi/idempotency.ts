import { createHash } from "node:crypto";

import { and, eq, lt } from "drizzle-orm";

import { idempotencyKeys, withBusinessTransaction, type Database } from "@lobbystack/db";
import { PUBLIC_API_IDEMPOTENCY_TTL_HOURS } from "@lobbystack/shared";

import type { DomainContext } from "../context";
import { invalidRequest, PublicApiError } from "./errors";

// Idempotency-Key support for v1 POSTs that create things. Keys are scoped to
// the API key and the operation, and remembered for 24 hours.
//
// The key row and the mutation commit in one transaction: the request's
// domain work runs on that transaction (nested calls become savepoints), and
// the stored response is written before it commits. A crash or error before
// commit rolls back both, so a retry runs again; after commit, a retry replays
// the stored response. A concurrent retry waits on the uncommitted key row and
// then replays. Error responses are not stored.

export type IdempotencyScope = { businessId: string; apiKeyId: string; operation: string; key: string };
export type StoredResponse = { status: number; body: unknown };

export function idempotencyRequestHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

export function validateIdempotencyKey(value: string | null): string | null {
  if (value === null) return null;
  const key = value.trim();
  if (!key || key.length > 255 || !/^[\x21-\x7e]+$/.test(key)) throw invalidRequest("Idempotency-Key must be 1 to 255 visible ASCII characters.");
  return key;
}

function scopeName(scope: IdempotencyScope): string {
  return `api:${scope.apiKeyId}:${scope.operation}`.slice(0, 120);
}

/**
 * Runs `run` once per Idempotency-Key. `run` receives a context bound to the
 * transaction that also records the key, and must do all of its writes
 * through that context.
 */
export async function runIdempotent(
  context: DomainContext,
  scope: IdempotencyScope,
  requestHash: string,
  run: (transactional: DomainContext) => Promise<StoredResponse>,
): Promise<{ replayed: boolean; response: StoredResponse }> {
  return await withBusinessTransaction(context.db, { businessId: scope.businessId, actorType: "worker" }, async (tx) => {
    const scopeValue = scopeName(scope);
    const match = and(eq(idempotencyKeys.scope, scopeValue), eq(idempotencyKeys.key, scope.key), eq(idempotencyKeys.businessId, scope.businessId));
    await tx.delete(idempotencyKeys).where(and(match, lt(idempotencyKeys.createdAt, new Date(Date.now() - PUBLIC_API_IDEMPOTENCY_TTL_HOURS * 3_600_000))));
    // Blocks while another transaction holds the same key, then does nothing if that one committed.
    const inserted = await tx.insert(idempotencyKeys).values({ scope: scopeValue, key: scope.key, businessId: scope.businessId, status: "processing", response: { requestHash } }).onConflictDoNothing().returning({ id: idempotencyKeys.id });
    if (!inserted.length) {
      const [existing] = await tx.select().from(idempotencyKeys).where(match).limit(1);
      const stored = existing?.response as { requestHash?: string; status?: number; body?: unknown } | null | undefined;
      if (!existing || existing.status !== "completed" || typeof stored?.status !== "number") throw new PublicApiError(409, "idempotency_request_in_progress", "A request with this Idempotency-Key is still running. Retry shortly.");
      if (stored.requestHash !== requestHash) throw new PublicApiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request body.");
      return { replayed: true, response: { status: stored.status, body: stored.body } };
    }
    const response = await run({ ...context, db: tx as unknown as Database });
    await tx.update(idempotencyKeys).set({ status: "completed", response: { requestHash, status: response.status, body: response.body }, updatedAt: new Date() }).where(eq(idempotencyKeys.id, inserted[0]!.id));
    return { replayed: false, response };
  });
}
