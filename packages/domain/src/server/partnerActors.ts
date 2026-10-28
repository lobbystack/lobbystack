import { and, eq, sql } from "drizzle-orm";

import { partnerMembers, type DatabaseTransaction, type RlsContext } from "@lobbystack/db";
import { keyHasScope, type PartnerRole, type partnerOwnerScopes } from "@lobbystack/shared";

import { AuthorizationError } from "../authz";
import type { PartnerActor } from "./partners";
import { PublicApiError } from "./publicApi/errors";

// How a partner operation tells who acts: one of the partner's people, by
// the role the database has for them now, or one of its platform keys. A key
// acts as the partner with an admin's rights while it's active (ADR 0010,
// migration 0162), so what only an owner may do stays with people, apart from
// billing: a key reaches the partner's Stripe account and tier only with the
// partner.billing scopes, which only an owner grants, and only while the
// owner who granted them is still one (migrations 0163 and 0166).

export type PartnerKeyActor = Extract<PartnerActor, { kind: "key" }>;

/** The RLS settings for a transaction an actor runs on the partner: the person, or the key. */
export function partnerRls(actor: PartnerActor): Pick<RlsContext, "userId" | "platformKeyId"> {
  return actor.kind === "member" ? { userId: actor.userId } : { platformKeyId: actor.platformKeyId };
}

/** The person behind an actor, for columns and audit rows that name one. A key has none. */
export function actorUserId(actor: PartnerActor): string | null {
  return actor.kind === "member" ? actor.userId : null;
}

/** What an audit row records about a key, on top of the partner. */
export function keyAuditFields(actor: PartnerActor): { actor: "platform_key"; platformKeyId: string } | Record<string, never> {
  return actor.kind === "key" ? { actor: "platform_key", platformKeyId: actor.platformKeyId } : {};
}

/**
 * Checks a key is the partner's and still active, holding a share lock on it
 * until the transaction ends, so revoking it waits for what this writes. A
 * revoked key answers as an invalid one.
 */
export async function lockPartnerKey(tx: DatabaseTransaction, actor: PartnerKeyActor): Promise<void> {
  const result = await tx.execute<{ active: boolean }>(sql`select app.lock_partner_platform_key(${actor.partnerId}::uuid, ${actor.platformKeyId}::uuid) as active`);
  if (result.rows[0]?.active !== true) throw new PublicApiError(401, "unauthorized", "The API key is invalid or has been revoked.", undefined, { "WWW-Authenticate": "Bearer" });
}

/**
 * The actor's role on the partner as the database has it now: a person's
 * role while they're on the team, or admin for an active key.
 */
export async function partnerActorRole(tx: DatabaseTransaction, actor: PartnerActor): Promise<PartnerRole> {
  if (actor.kind === "key") {
    await lockPartnerKey(tx, actor);
    return "admin";
  }
  const [member] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, actor.partnerId), eq(partnerMembers.userId, actor.userId), eq(partnerMembers.status, "active"))).limit(1);
  if (!member) throw new AuthorizationError("You aren't on this partner's team.");
  return member.role;
}

/**
 * Refuses anyone but an owner, or a key an owner granted the scope, with the
 * same 403 the console's owner-only pages answer. partner.billing:write
 * grants partner.billing:read too. A key's billing scopes count only while
 * the owner who granted them is still one of the partner's active owners,
 * and a key whose owner isn't is refused with key_owner_inactive.
 */
export async function requirePartnerOwner(tx: DatabaseTransaction, actor: PartnerActor, input: { scope: (typeof partnerOwnerScopes)[number]; message: string }): Promise<void> {
  if (actor.kind === "key") {
    await lockPartnerKey(tx, actor);
    if (!keyHasScope(actor.scopes ?? [], input.scope)) throw Object.assign(new Error(input.message), { status: 403, code: "owner_only" });
    const owner = (await tx.execute<{ owner: string | null }>(sql`select app.partner_platform_key_owner(${actor.partnerId}::uuid, ${actor.platformKeyId}::uuid) as owner`)).rows[0]?.owner;
    if (!owner) throw Object.assign(new Error("The owner who gave this key its billing scopes is no longer an owner of the partner, so they no longer apply. Ask an owner to save the key again with them, or to make a new key."), { status: 409, code: "key_owner_inactive" });
    return;
  }
  if (await partnerActorRole(tx, actor) !== "owner") throw Object.assign(new Error(input.message), { status: 403, code: "owner_only" });
}
