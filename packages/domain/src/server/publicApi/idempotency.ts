import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { idempotencyKeys, withBusinessTransaction } from "@lobbystack/db";
import { PUBLIC_API_IDEMPOTENCY_TTL_HOURS } from "@lobbystack/shared";

import type { DomainContext } from "../context";
import { invalidRequest, PublicApiError } from "./errors";

// Idempotency-Key support for v1 POSTs that create things. Keys are scoped to
// the API key and the operation, and remembered for 24 hours. A repeat with the
// same body replays the first response; a repeat with a different body is
// rejected, and a repeat while the first is still running gets 409.

const STALE_PROCESSING_MS = 5 * 60_000;

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

export async function beginIdempotentRequest(context: DomainContext, scope: IdempotencyScope, requestHash: string): Promise<{ kind: "new" } | { kind: "replay"; response: StoredResponse }> {
  return await withBusinessTransaction(context.db, { businessId: scope.businessId, actorType: "worker" }, async (tx) => {
    const scopeValue = scopeName(scope);
    const inserted = await tx.insert(idempotencyKeys).values({ scope: scopeValue, key: scope.key, businessId: scope.businessId, status: "processing", response: { requestHash } }).onConflictDoNothing().returning({ id: idempotencyKeys.id });
    if (inserted.length) return { kind: "new" as const };
    const [existing] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scopeValue), eq(idempotencyKeys.key, scope.key), eq(idempotencyKeys.businessId, scope.businessId))).limit(1).for("update");
    if (!existing) throw new PublicApiError(409, "idempotency_request_in_progress", "A request with this Idempotency-Key is still running. Retry shortly.");
    const now = Date.now();
    const expired = now - existing.createdAt.getTime() > PUBLIC_API_IDEMPOTENCY_TTL_HOURS * 3_600_000;
    const stale = existing.status === "processing" && now - existing.updatedAt.getTime() > STALE_PROCESSING_MS;
    if (expired || stale) {
      await tx.update(idempotencyKeys).set({ status: "processing", response: { requestHash }, createdAt: expired ? new Date() : existing.createdAt, updatedAt: new Date() }).where(eq(idempotencyKeys.id, existing.id));
      return { kind: "new" as const };
    }
    const stored = existing.response as { requestHash?: string; status?: number; body?: unknown } | null;
    if (stored?.requestHash !== requestHash) throw new PublicApiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request body.");
    if (existing.status !== "completed" || typeof stored.status !== "number") throw new PublicApiError(409, "idempotency_request_in_progress", "A request with this Idempotency-Key is still running. Retry shortly.");
    return { kind: "replay" as const, response: { status: stored.status, body: stored.body } };
  });
}

export async function completeIdempotentRequest(context: DomainContext, scope: IdempotencyScope, requestHash: string, response: StoredResponse): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: scope.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(idempotencyKeys).set({ status: "completed", response: { requestHash, status: response.status, body: response.body }, updatedAt: new Date() }).where(and(eq(idempotencyKeys.scope, scopeName(scope)), eq(idempotencyKeys.key, scope.key), eq(idempotencyKeys.businessId, scope.businessId)));
  });
}

/** Forgets a key after a server error so the client can retry with it. */
export async function releaseIdempotentRequest(context: DomainContext, scope: IdempotencyScope): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: scope.businessId, actorType: "worker" }, async (tx) => {
    await tx.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scopeName(scope)), eq(idempotencyKeys.key, scope.key), eq(idempotencyKeys.businessId, scope.businessId), eq(idempotencyKeys.status, "processing")));
  });
}
