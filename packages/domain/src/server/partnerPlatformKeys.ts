import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { partnerAuditLogs, partnerInvitations, partnerMembers, partnerPlatformKeys, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { apiKeyScopes, partnerOwnerScopes, type ApiKeyScope, type PartnerRole } from "@lobbystack/shared";

import { AuthorizationError } from "../authz";
import type { DomainContext } from "./context";
import type { PartnerActor, PartnerMemberActor } from "./partners";
import { newPlatformKeySecret, normalizePlatformKeyScopes } from "./publicApi/platformKeys";

// The platform keys a partner makes in its console (ADR 0010). They're the
// same lsp_ keys as the host's, with the same Platform endpoints, but each
// acts as the partner and reaches only its businesses, so a person leaving
// the team doesn't stop the keys they made. Only owners and admins make,
// list, change and revoke them, and a platform key can't manage keys. A key
// acts with an admin's rights, so only an owner grants the partner.billing
// scopes, which reach what only owners see in the console. Those scopes count
// only while the owner who granted them is still an active owner (migration
// 0166): the owner who made the key with them, or the owner who last saved
// the key with them. Only an owner changes a key that holds them, so an admin
// can neither add them nor take them off.

/** A partner's platform key as the console's API keys page shows it. The key itself is shown once, when it's made. */
export type PartnerPlatformKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  /** Who made it, while they're still on the partner's team. */
  createdBy: { userId: string; name: string | null; email: string | null } | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export const PARTNER_PLATFORM_KEY_NAME_MAX_LENGTH = 120;

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

function keyManager(actor: PartnerActor): PartnerMemberActor {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't manage a partner's platform keys.");
  return actor;
}

/** Refuses anyone but an active owner or admin of the partner, by the role the database has now, and returns it. */
async function requireKeyManager(tx: DatabaseTransaction, member: PartnerMemberActor): Promise<PartnerRole> {
  const [row] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, member.partnerId), eq(partnerMembers.userId, member.userId), eq(partnerMembers.status, "active"))).limit(1);
  if (!row) throw new AuthorizationError("You aren't on this partner's team.");
  if (row.role === "member") throw new AuthorizationError("Only owners and admins can manage the partner's platform keys.");
  return row.role;
}

const keyColumns = {
  id: partnerPlatformKeys.id,
  name: partnerPlatformKeys.name,
  prefix: partnerPlatformKeys.prefix,
  scopes: partnerPlatformKeys.scopes,
  createdAt: partnerPlatformKeys.createdAt,
  createdByUserId: partnerPlatformKeys.createdByUserId,
  lastUsedAt: partnerPlatformKeys.lastUsedAt,
  revokedAt: partnerPlatformKeys.revokedAt,
};

type KeyRow = { id: string; name: string; prefix: string; scopes: string[]; createdAt: Date; createdByUserId: string | null; lastUsedAt: Date | null; revokedAt: Date | null };
type TeamPerson = { name: string | null; email: string };

/** The partner's active members by user id. RLS hides other people's users rows from the app role, so they're read through this function. */
async function teamPeople(tx: DatabaseTransaction, partnerId: string): Promise<Map<string, TeamPerson>> {
  const rows = await tx.execute<{ user_id: string; name: string | null; email: string }>(sql`select user_id, name, email from app.list_partner_members(${partnerId}::uuid)`);
  return new Map(rows.rows.map((row) => [row.user_id, { name: row.name, email: row.email }]));
}

function serializeKey(row: KeyRow, people: Map<string, TeamPerson>): PartnerPlatformKeyRecord {
  const creator = row.createdByUserId ? people.get(row.createdByUserId) : undefined;
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    // Canonical order, and only scopes this version knows.
    scopes: apiKeyScopes.filter((scope) => row.scopes.includes(scope)),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdByUserId && creator ? { userId: row.createdByUserId, name: creator.name, email: creator.email } : null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

const hasBillingScope = (scopes: readonly string[]) => scopes.some((scope) => (partnerOwnerScopes as readonly string[]).includes(scope));

function normalizeName(value: string): string {
  const name = value.replace(/\s+/g, " ").trim();
  if (!name || name.length > PARTNER_PLATFORM_KEY_NAME_MAX_LENGTH) throw failure(`Name the key in 1 to ${PARTNER_PLATFORM_KEY_NAME_MAX_LENGTH} characters.`, 400, "invalid_name");
  return name;
}

async function readKey(tx: DatabaseTransaction, partnerId: string, platformKeyId: string): Promise<PartnerPlatformKeyRecord | null> {
  const [row] = await tx.select(keyColumns).from(partnerPlatformKeys).where(and(eq(partnerPlatformKeys.id, platformKeyId), eq(partnerPlatformKeys.partnerId, partnerId))).limit(1);
  return row ? serializeKey(row, await teamPeople(tx, partnerId)) : null;
}

/** The partner's platform keys, newest first, revoked ones included. Only owners and admins can read them. */
export async function listPartnerPlatformKeys(context: DomainContext, actor: PartnerActor): Promise<PartnerPlatformKeyRecord[]> {
  const member = keyManager(actor);
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    await requireKeyManager(tx, member);
    const rows = await tx.select(keyColumns).from(partnerPlatformKeys).where(eq(partnerPlatformKeys.partnerId, member.partnerId)).orderBy(desc(partnerPlatformKeys.createdAt), desc(partnerPlatformKeys.id));
    const people = await teamPeople(tx, member.partnerId);
    return rows.map((row) => serializeKey(row, people));
  });
}

/**
 * Makes a platform key for the partner and returns it once; only its hash is
 * kept. Owners and admins choose its name and scopes, the platform-only ones
 * included. The key acts as the partner, with access to the partner's
 * businesses and no others.
 */
export async function createPartnerPlatformKey(context: DomainContext, actor: PartnerActor, input: { name: string; scopes: unknown }): Promise<{ platformKey: PartnerPlatformKeyRecord; key: string }> {
  const member = keyManager(actor);
  const name = normalizeName(input.name);
  const scopes = normalizePlatformKeyScopes(input.scopes);
  if (!scopes) throw failure("Choose at least one of the API's scopes.", 400, "invalid_scopes");
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    const role = await requireKeyManager(tx, member);
    if (role !== "owner" && hasBillingScope(scopes)) throw failure("Only owners can grant partner.billing:read or partner.billing:write, which reach the partner's Stripe account and billing.", 403, "owner_only");
    // Prefixes are random, so a second try only runs if another key already has this one.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const secret = newPlatformKeySecret();
      const [row] = await tx.insert(partnerPlatformKeys).values({ partnerId: member.partnerId, name, prefix: secret.prefix, keyHash: secret.hash, scopes, createdByUserId: member.userId, billingScopesGrantedByUserId: hasBillingScope(scopes) ? member.userId : null }).onConflictDoNothing().returning({ id: partnerPlatformKeys.id });
      if (!row) continue;
      const platformKey = await readKey(tx, member.partnerId, row.id);
      if (!platformKey) throw new Error("The platform key could not be read back.");
      return { platformKey, key: secret.key };
    }
    throw new Error("The platform key could not be created.");
  });
}

/**
 * Changes a platform key's name and scopes; the key itself stays the same.
 * Owners and admins change keys, with the rules for making one: only an
 * owner grants the partner.billing scopes. Only an owner changes a key that
 * already holds one, so an admin can't take them off or keep them on a key
 * they've changed either. An owner who saves a key with a billing scope
 * becomes the owner they count on, and a key saved without one has nobody.
 * A revoked key can't change. Each change goes in the partner's audit log.
 */
export async function updatePartnerPlatformKey(context: DomainContext, actor: PartnerActor, input: { platformKeyId: string; name: string; scopes: unknown }): Promise<{ platformKey: PartnerPlatformKeyRecord }> {
  const member = keyManager(actor);
  const name = normalizeName(input.name);
  const scopes = normalizePlatformKeyScopes(input.scopes);
  if (!scopes) throw failure("Choose at least one of the API's scopes.", 400, "invalid_scopes");
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    const role = await requireKeyManager(tx, member);
    const where = and(eq(partnerPlatformKeys.id, input.platformKeyId), eq(partnerPlatformKeys.partnerId, member.partnerId));
    const [existing] = await tx.select({ name: partnerPlatformKeys.name, prefix: partnerPlatformKeys.prefix, scopes: partnerPlatformKeys.scopes, revokedAt: partnerPlatformKeys.revokedAt }).from(partnerPlatformKeys).where(where).limit(1);
    if (!existing) throw failure("Platform key not found.", 404, "not_found");
    if (existing.revokedAt) throw failure("A revoked key can't be changed.", 409, "revoked");
    if (role !== "owner" && hasBillingScope(existing.scopes)) throw failure("Only owners can change a key with partner.billing:read or partner.billing:write.", 403, "owner_only");
    if (role !== "owner" && hasBillingScope(scopes)) throw failure("Only owners can grant partner.billing:read or partner.billing:write, which reach the partner's Stripe account and billing.", 403, "owner_only");
    const updated = await tx.update(partnerPlatformKeys).set({ name, scopes, updatedByUserId: member.userId, billingScopesGrantedByUserId: hasBillingScope(scopes) ? member.userId : null, updatedAt: new Date() }).where(and(where, isNull(partnerPlatformKeys.revokedAt))).returning({ id: partnerPlatformKeys.id });
    // Someone revoked it at the same moment, or row-level security refused the change, which must not pass for success.
    // A key that gained a billing scope meanwhile is the database's to refuse: it checks the key as it was before the change.
    if (!updated.length) throw new AuthorizationError("Only owners and admins can manage the partner's platform keys.");
    await tx.insert(partnerAuditLogs).values({ partnerId: member.partnerId, actorUserId: member.userId, eventType: "platform_key.updated", entityType: "platform_key", entityId: input.platformKeyId, payload: { prefix: existing.prefix, before: { name: existing.name, scopes: existing.scopes }, after: { name, scopes } } });
    const platformKey = await readKey(tx, member.partnerId, input.platformKeyId);
    if (!platformKey) throw failure("Platform key not found.", 404, "not_found");
    return { platformKey };
  });
}

/**
 * Revokes one of the partner's platform keys for good. Requests with it fail
 * from then on. In the same transaction, the webhook endpoints it set up on
 * any business turn off, and the invitations it sent to join a business's
 * team or the partner's that nobody accepted yet are revoked. The invitation to own a business,
 * which the key sent as it created the business, stays. A request that
 * resolved the key just before holds a lock on it while it writes, so the
 * revoke waits for it and catches what it wrote. Revoking a revoked key
 * changes nothing and still succeeds. Only owners and admins can revoke a key.
 */
export async function revokePartnerPlatformKey(context: DomainContext, actor: PartnerActor, input: { platformKeyId: string }): Promise<{ platformKey: PartnerPlatformKeyRecord; disabledWebhookEndpointIds: string[]; revokedInvitationIds: string[] }> {
  const member = keyManager(actor);
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    await requireKeyManager(tx, member);
    const where = and(eq(partnerPlatformKeys.id, input.platformKeyId), eq(partnerPlatformKeys.partnerId, member.partnerId));
    const [existing] = await tx.select({ revokedAt: partnerPlatformKeys.revokedAt }).from(partnerPlatformKeys).where(where).limit(1);
    if (!existing) throw failure("Platform key not found.", 404, "not_found");
    let disabledWebhookEndpointIds: string[] = [];
    let revokedInvitationIds: string[] = [];
    if (!existing.revokedAt) {
      const now = new Date();
      const revoked = await tx.update(partnerPlatformKeys).set({ revokedAt: now, revokedByUserId: member.userId, updatedAt: now }).where(and(where, isNull(partnerPlatformKeys.revokedAt))).returning({ id: partnerPlatformKeys.id });
      if (revoked.length) {
        // A leaked key must not keep receiving its businesses' data, or leave a way onto their teams behind.
        const disabled = await tx.execute<{ endpoint_id: string }>(sql`select endpoint_id from app.disable_revoked_partner_platform_key_webhooks(${input.platformKeyId}::uuid)`);
        disabledWebhookEndpointIds = disabled.rows.map((row) => row.endpoint_id);
        const invitations = await tx.execute<{ invitation_id: string }>(sql`select invitation_id from app.revoke_partner_platform_key_invitations(${input.platformKeyId}::uuid)`);
        revokedInvitationIds = invitations.rows.map((row) => row.invitation_id);
        // An invitation to the partner's team works while its key does, and a leaked key must leave no way onto the team behind.
        const team = await tx.update(partnerInvitations).set({ status: "revoked", updatedAt: now }).where(and(eq(partnerInvitations.partnerId, member.partnerId), eq(partnerInvitations.invitedByPlatformKeyId, input.platformKeyId), eq(partnerInvitations.status, "pending"))).returning({ id: partnerInvitations.id });
        revokedInvitationIds.push(...team.map((row) => row.id));
      } else {
        // Nothing changed: someone revoked it at the same moment, or row-level security refused the change, which must not pass for success.
        const [current] = await tx.select({ revokedAt: partnerPlatformKeys.revokedAt }).from(partnerPlatformKeys).where(where).limit(1);
        if (!current?.revokedAt) throw new AuthorizationError("Only owners and admins can manage the partner's platform keys.");
      }
    }
    const platformKey = await readKey(tx, member.partnerId, input.platformKeyId);
    if (!platformKey) throw failure("Platform key not found.", 404, "not_found");
    return { platformKey, disabledWebhookEndpointIds, revokedInvitationIds };
  });
}
