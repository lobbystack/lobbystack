import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { auditLogs, oauthAccessTokens, oauthClients, oauthConsents, oauthRefreshTokens, withBusinessTransaction, type Database } from "@lobbystack/db";
import { isApiKeyScope, type ApiKeyScope } from "@lobbystack/shared";

import { hasMinimumRole, requireBusinessAdmin } from "../../authz";
import type { DomainContext } from "../context";
import { listUserBusinesses } from "../tenancy";

// Connected apps: the OAuth grants an owner or admin gave MCP clients for one
// business. The dashboard lists and revokes them with the app role, inside the
// business's RLS context.

export type OAuthGrantRecord = {
  id: string;
  clientId: string;
  clientName: string | null;
  clientUri: string | null;
  /** How the client registered: "cimd" for a Client ID Metadata Document, null for dynamic registration. */
  clientDiscovery: string | null;
  scopes: ApiKeyScope[];
  grantedBy: { userId: string; name: string | null; email: string | null } | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
};

const iso = (value: Date | null) => value?.toISOString() ?? null;

export async function listOAuthGrants(context: DomainContext, input: { userId: string; businessId: string }): Promise<OAuthGrantRecord[]> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const rows = await tx.select({
      id: oauthConsents.id,
      clientId: oauthConsents.clientId,
      clientName: oauthClients.name,
      clientUri: oauthClients.uri,
      clientDiscovery: oauthClients.clientDiscoveryId,
      scopes: oauthConsents.scopes,
      userId: oauthConsents.userId,
      createdAt: oauthConsents.createdAt,
      updatedAt: oauthConsents.updatedAt,
      lastUsedAt: oauthConsents.lastUsedAt,
    }).from(oauthConsents)
      .leftJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
      .where(eq(oauthConsents.referenceId, input.businessId))
      .orderBy(desc(oauthConsents.createdAt));
    // users_self_access hides other people's users rows from the app role, so
    // grantor names come from a function limited to this business's grants.
    const grantors = await tx.execute<{ user_id: string; name: string | null; email: string | null }>(sql`select user_id, name, email from app.list_oauth_grantors(${input.businessId}::uuid)`);
    const byId = new Map(grantors.rows.map((row) => [row.user_id, row]));
    return rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      clientName: row.clientName,
      clientUri: row.clientUri,
      clientDiscovery: row.clientDiscovery,
      scopes: row.scopes.filter(isApiKeyScope),
      grantedBy: row.userId ? { userId: row.userId, name: byId.get(row.userId)?.name ?? null, email: byId.get(row.userId)?.email ?? null } : null,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      lastUsedAt: iso(row.lastUsedAt),
    }));
  });
}

/**
 * Revokes a connected app for the business: deletes the grant and revokes
 * every access and refresh token issued under it, so the next MCP request with
 * any of them fails. Revoking a grant that no longer exists returns false.
 */
export async function revokeOAuthGrant(context: DomainContext, input: { userId: string; businessId: string; grantId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [grant] = await tx.select({ id: oauthConsents.id, clientId: oauthConsents.clientId, userId: oauthConsents.userId, scopes: oauthConsents.scopes })
      .from(oauthConsents)
      .where(and(eq(oauthConsents.id, input.grantId), eq(oauthConsents.referenceId, input.businessId)))
      .limit(1);
    if (!grant) return false;
    const now = new Date();
    const sameGrant = (table: typeof oauthAccessTokens | typeof oauthRefreshTokens) => and(
      eq(table.clientId, grant.clientId),
      grant.userId ? eq(table.userId, grant.userId) : isNull(table.userId),
      eq(table.referenceId, input.businessId),
      isNull(table.revoked),
    );
    await tx.update(oauthAccessTokens).set({ revoked: now }).where(sameGrant(oauthAccessTokens));
    await tx.update(oauthRefreshTokens).set({ revoked: now }).where(sameGrant(oauthRefreshTokens));
    await tx.delete(oauthConsents).where(eq(oauthConsents.id, grant.id));
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "oauth_grant.revoked", entityType: "oauth_grant", payload: { grantId: grant.id, clientId: grant.clientId, grantedByUserId: grant.userId } });
    return true;
  });
}

/** Writes the audit row for a grant an owner or admin just approved on the consent screen. */
export async function recordOAuthGrantApproved(context: DomainContext, input: { userId: string; businessId: string; clientId: string; scopes: string[] }): Promise<void> {
  await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [grant] = await tx.select({ id: oauthConsents.id }).from(oauthConsents)
      .where(and(eq(oauthConsents.clientId, input.clientId), eq(oauthConsents.userId, input.userId), eq(oauthConsents.referenceId, input.businessId)))
      .limit(1);
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "oauth_grant.approved", entityType: "oauth_grant", payload: { grantId: grant?.id ?? null, clientId: input.clientId, scopes: input.scopes } });
  });
}

/** Businesses the user may connect an MCP client to: those where they are an owner or admin. */
export async function listGrantableBusinesses(db: Database, userId: string): Promise<Array<{ businessId: string; name: string; role: string; active: boolean }>> {
  const businesses = await listUserBusinesses(db, userId);
  return businesses.filter((business) => hasMinimumRole(business.role, "business_admin")).map((business) => ({ businessId: business.businessId, name: business.name, role: business.role, active: business.active }));
}
