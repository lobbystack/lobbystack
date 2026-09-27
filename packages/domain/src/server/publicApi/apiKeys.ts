import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { apiKeys, auditLogs, users, withBusinessTransaction } from "@lobbystack/db";
import { API_KEY_PREFIX, apiKeyScopes, isApiKeyScope, type ApiKeyScope } from "@lobbystack/shared";

import { requireBusinessAdmin } from "../../authz";
import type { DomainContext } from "../context";
import { invalidRequest } from "./errors";

// Keys look like lsk_<8 hex id>_<32 url-safe characters>. The first part is
// the prefix people see in the dashboard; only a SHA-256 hash of the whole key
// is stored. 192 random bits make a salted or slow hash unnecessary.
const KEY_PATTERN = /^lsk_[0-9a-f]{8}_[A-Za-z0-9_-]{32}$/;

export type GeneratedApiKey = { key: string; prefix: string; keyHash: string };

export function generateApiKey(): GeneratedApiKey {
  const shortId = randomBytes(4).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const key = `${API_KEY_PREFIX}${shortId}_${secret}`;
  return { key, prefix: `${API_KEY_PREFIX}${shortId}`, keyHash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isWellFormedApiKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/** Reads `Authorization: Bearer <key>`. Returns null for any other shape. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}

export function hashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeScopes(value: unknown): ApiKeyScope[] {
  if (!Array.isArray(value) || value.length === 0) throw invalidRequest("Choose at least one scope.");
  const unknown = value.filter((scope) => !isApiKeyScope(scope));
  if (unknown.length) throw invalidRequest(`Unknown scopes: ${unknown.map(String).join(", ")}.`);
  // Keep the canonical order so stored keys compare cleanly.
  return apiKeyScopes.filter((scope) => value.includes(scope));
}

export type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  createdBy: { userId: string; name: string | null; email: string | null } | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function serializeApiKey(row: { id: string; name: string; prefix: string; scopes: string[]; createdAt: Date; createdByUserId: string | null; createdByName: string | null; createdByEmail: string | null; lastUsedAt: Date | null; revokedAt: Date | null }): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes.filter(isApiKeyScope),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdByUserId ? { userId: row.createdByUserId, name: row.createdByName, email: row.createdByEmail } : null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

const apiKeyColumns = {
  id: apiKeys.id,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  scopes: apiKeys.scopes,
  createdAt: apiKeys.createdAt,
  createdByUserId: apiKeys.createdByUserId,
  createdByName: users.name,
  createdByEmail: users.email,
  lastUsedAt: apiKeys.lastUsedAt,
  revokedAt: apiKeys.revokedAt,
};

/** Owners and admins only. Returns the plaintext key once; it is not recoverable afterwards. */
export async function createApiKey(
  context: DomainContext,
  input: { userId: string; businessId: string; name: string; scopes: unknown },
): Promise<{ apiKey: ApiKeyRecord; key: string }> {
  const name = input.name.trim();
  if (!name || name.length > 120) throw invalidRequest("Name the key in 1 to 120 characters.");
  const scopes = normalizeScopes(input.scopes);
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const generated = generateApiKey();
    const [row] = await tx.insert(apiKeys).values({ businessId: input.businessId, name, prefix: generated.prefix, keyHash: generated.keyHash, scopes, createdByUserId: input.userId }).returning({ id: apiKeys.id });
    if (!row) throw new Error("The API key could not be created.");
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "api_key.created", entityType: "api_key", entityId: row.id, payload: { prefix: generated.prefix, scopes } });
    const [record] = await tx.select(apiKeyColumns).from(apiKeys).leftJoin(users, eq(users.id, apiKeys.createdByUserId)).where(eq(apiKeys.id, row.id)).limit(1);
    if (!record) throw new Error("The API key could not be read back.");
    return { apiKey: serializeApiKey(record), key: generated.key };
  });
}

export async function listApiKeys(context: DomainContext, input: { userId: string; businessId: string }): Promise<ApiKeyRecord[]> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const rows = await tx.select(apiKeyColumns).from(apiKeys).leftJoin(users, eq(users.id, apiKeys.createdByUserId)).where(eq(apiKeys.businessId, input.businessId)).orderBy(desc(apiKeys.createdAt));
    return rows.map(serializeApiKey);
  });
}

/** Revoking is permanent. Revoking a revoked key is a no-op that still succeeds. */
export async function revokeApiKey(context: DomainContext, input: { userId: string; businessId: string; apiKeyId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [existing] = await tx.select({ id: apiKeys.id, revokedAt: apiKeys.revokedAt, prefix: apiKeys.prefix }).from(apiKeys).where(and(eq(apiKeys.id, input.apiKeyId), eq(apiKeys.businessId, input.businessId))).limit(1).for("update");
    if (!existing) return false;
    if (existing.revokedAt) return true;
    await tx.update(apiKeys).set({ revokedAt: new Date(), revokedByUserId: input.userId, updatedAt: new Date() }).where(eq(apiKeys.id, existing.id));
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "api_key.revoked", entityType: "api_key", entityId: existing.id, payload: { prefix: existing.prefix } });
    return true;
  });
}

export type ResolvedApiKey = { businessId: string; apiKeyId: string; scopes: ApiKeyScope[] };

/**
 * Maps a presented key to its business through a SECURITY DEFINER resolver,
 * because the request has no tenant context yet. Revoked keys and keys of
 * inactive businesses resolve to null.
 */
export async function resolveApiKey(context: DomainContext, key: string): Promise<ResolvedApiKey | null> {
  if (!isWellFormedApiKey(key)) return null;
  const result = await context.db.execute<{ business_id: string; api_key_id: string; scopes: unknown }>(sql`select business_id, api_key_id, scopes from app.resolve_api_key(${hashApiKey(key)})`);
  const row = result.rows[0];
  if (!row) return null;
  return { businessId: row.business_id, apiKeyId: row.api_key_id, scopes: Array.isArray(row.scopes) ? row.scopes.filter(isApiKeyScope) : [] };
}

/** Records use at most once a minute per key so busy integrations do not write on every request. */
export async function touchApiKeyLastUsed(context: DomainContext, input: { businessId: string; apiKeyId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(apiKeys).set({ lastUsedAt: new Date() }).where(and(eq(apiKeys.id, input.apiKeyId), eq(apiKeys.businessId, input.businessId), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, new Date(Date.now() - 60_000)))));
  });
}
