import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { auditLogs, oauthAccessTokens, oauthClients, oauthConsents, oauthRefreshTokens, partnerAuditLogs, withBusinessTransaction, type Database } from "@lobbystack/db";
import { isApiKeyScope, type ApiKeyScope, type PartnerRole } from "@lobbystack/shared";

import { hasMinimumRole, requireBusinessAdmin } from "../../authz";
import { HOST_BRAND_SCOPE } from "../businessAccess";
import type { DomainContext } from "../context";
import { listUserPartners, type PartnerMemberActor } from "../partners";
import { partnerActorRole } from "../partnerActors";
import { listUserBusinesses } from "../tenancy";
import { partnerOAuthReference } from "./tokens";

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

/**
 * Businesses the user may connect an MCP client to: those where they are an
 * owner or admin. MCP stays on the host's domain and a partner's businesses
 * never get it, so only direct businesses count.
 */
export async function listGrantableBusinesses(db: Database, userId: string): Promise<Array<{ businessId: string; name: string; role: string; active: boolean }>> {
  const businesses = await listUserBusinesses(db, userId, HOST_BRAND_SCOPE);
  return businesses.filter((business) => hasMinimumRole(business.role, "business_admin")).map((business) => ({ businessId: business.businessId, name: business.name, role: business.role, active: business.active }));
}

// Agency connections (ADR 0011): grants for one person on a partner's team,
// whose reference_id names the partner. The console's API keys page lists
// and disconnects them. Owners and admins see every one of the partner's,
// and anyone on the team sees and disconnects their own. Approvals and
// disconnections go in partner_audit_logs.

/** The partners a person may connect an MCP client to: every partner whose team they're on now. */
export async function listGrantablePartners(context: DomainContext, userId: string): Promise<Array<{ partnerId: string; name: string; role: PartnerRole }>> {
  return (await listUserPartners(context, userId)).map(({ partnerId, name, role }) => ({ partnerId, name, role }));
}

/** Writes the partner's audit row for an agency connection its person just approved on the consent screen. */
export async function recordPartnerOAuthGrantApproved(context: DomainContext, input: { userId: string; partnerId: string; clientId: string; scopes: string[] }): Promise<void> {
  await withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async (tx) => {
    const actor: PartnerMemberActor = { kind: "member", partnerId: input.partnerId, userId: input.userId, role: "member" };
    const role = await partnerActorRole(tx, actor);
    const [grant] = await tx.select({ id: oauthConsents.id }).from(oauthConsents)
      .where(and(eq(oauthConsents.clientId, input.clientId), eq(oauthConsents.userId, input.userId), eq(oauthConsents.referenceId, partnerOAuthReference(input.partnerId))))
      .limit(1);
    await tx.insert(partnerAuditLogs).values({ partnerId: input.partnerId, actorUserId: input.userId, eventType: "oauth_grant.approved", entityType: "oauth_grant", entityId: grant?.id ?? null, payload: { grantId: grant?.id ?? null, clientId: input.clientId, scopes: input.scopes, partnerRole: role } });
  });
}

/** The partner's agency connections the actor may see: all of them for an owner or admin, their own otherwise. */
export async function listPartnerOAuthGrants(context: DomainContext, actor: PartnerMemberActor): Promise<OAuthGrantRecord[]> {
  return await withBusinessTransaction(context.db, { userId: actor.userId, actorType: "operator" }, async (tx) => {
    // Row-level security keeps a member to their own; the role check keeps someone off the team out.
    await partnerActorRole(tx, actor);
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
      .where(eq(oauthConsents.referenceId, partnerOAuthReference(actor.partnerId)))
      .orderBy(desc(oauthConsents.createdAt));
    const grantors = await tx.execute<{ user_id: string; name: string | null; email: string | null }>(sql`select user_id, name, email from app.list_partner_oauth_grantors(${actor.partnerId}::uuid)`);
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
 * Disconnects an agency connection: deletes the grant and revokes every
 * token issued under it, so the client's next MCP request fails. An owner or
 * admin disconnects anyone's; anyone else only their own, and someone else's
 * answers as one that doesn't exist. Returns false when there's no such grant.
 */
export async function revokePartnerOAuthGrant(context: DomainContext, actor: PartnerMemberActor, input: { grantId: string }): Promise<boolean> {
  const reference = partnerOAuthReference(actor.partnerId);
  return await withBusinessTransaction(context.db, { userId: actor.userId, actorType: "operator" }, async (tx) => {
    await partnerActorRole(tx, actor);
    const [grant] = await tx.select({ id: oauthConsents.id, clientId: oauthConsents.clientId, userId: oauthConsents.userId, scopes: oauthConsents.scopes })
      .from(oauthConsents)
      .where(and(eq(oauthConsents.id, input.grantId), eq(oauthConsents.referenceId, reference)))
      .limit(1);
    if (!grant) return false;
    const now = new Date();
    const sameGrant = (table: typeof oauthAccessTokens | typeof oauthRefreshTokens) => and(
      eq(table.clientId, grant.clientId),
      grant.userId ? eq(table.userId, grant.userId) : isNull(table.userId),
      eq(table.referenceId, reference),
      isNull(table.revoked),
    );
    await tx.update(oauthAccessTokens).set({ revoked: now }).where(sameGrant(oauthAccessTokens));
    await tx.update(oauthRefreshTokens).set({ revoked: now }).where(sameGrant(oauthRefreshTokens));
    await tx.delete(oauthConsents).where(eq(oauthConsents.id, grant.id));
    await tx.insert(partnerAuditLogs).values({ partnerId: actor.partnerId, actorUserId: actor.userId, eventType: "oauth_grant.revoked", entityType: "oauth_grant", entityId: grant.id, payload: { grantId: grant.id, clientId: grant.clientId, grantedByUserId: grant.userId } });
    return true;
  });
}
