import { eq, and, sql } from "drizzle-orm";

import type { AuthzRole } from "@lobbystack/contracts";
import type { DatabaseTransaction } from "@lobbystack/db";
import { businessMemberships } from "@lobbystack/db";
import type { PartnerRole } from "@lobbystack/shared";

export class AuthorizationError extends Error {
  readonly status = 403;
  readonly code = "forbidden";

  constructor(message = "You do not have access to this business.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

const roleRank: Record<AuthzRole, number> = {
  viewer: 10,
  scheduler: 20,
  business_admin: 30,
  business_owner: 40,
  platform_admin: 50,
};

export function hasMinimumRole(role: string, minimum: AuthzRole): boolean {
  const current = roleRank[role as AuthzRole];
  return current !== undefined && current >= roleRank[minimum];
}

/**
 * The role a partner member acts with in a business they opened: an admin's.
 * They work there with full access, minus what a partner's business never
 * gives (billing, API keys and MCP), but aren't on its team, so they never
 * take an owner's place.
 */
export const PARTNER_ACCESS_ROLE = "business_admin" satisfies AuthzRole;

/** The person's role on the business's own team, or null when they aren't on it. */
export async function readTeamRole(tx: DatabaseTransaction, input: { userId: string; businessId: string }): Promise<AuthzRole | null> {
  const [membership] = await tx
    .select({ role: businessMemberships.role })
    .from(businessMemberships)
    .where(and(eq(businessMemberships.userId, input.userId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")))
    .limit(1);
  return (membership?.role as AuthzRole | undefined) ?? null;
}

/**
 * The person's role on the business's partner's team while they hold an
 * unexpired open of the business, or null. The database answers, through
 * app.partner_access_role, so the application and row-level security agree.
 * The transaction must act as the person.
 */
export async function readPartnerAccessRole(tx: DatabaseTransaction, input: { userId: string; businessId: string }): Promise<PartnerRole | null> {
  const rows = await tx.execute<{ role: PartnerRole | null }>(sql`select app.partner_access_role(${input.businessId}::uuid) as role where app.current_user_id() = ${input.userId}::uuid`);
  return rows.rows[0]?.role ?? null;
}

/**
 * The person's role in the business: their own on its team, or an admin's
 * while they hold a partner open of it. Throws an AuthorizationError when
 * they have neither, or their role is below `minimumRole`. Operations a
 * partner open must not reach, such as verifying a phone, call
 * requireTeamMembership instead.
 */
export async function requireBusinessMembership(
  tx: DatabaseTransaction,
  input: { userId: string; businessId: string; minimumRole?: AuthzRole },
): Promise<{ userId: string; businessId: string; role: AuthzRole; via: "membership" | "partner" }> {
  const teamRole = await readTeamRole(tx, input);
  const partnerRole = teamRole ? null : await readPartnerAccessRole(tx, input);
  const role = teamRole ?? (partnerRole ? PARTNER_ACCESS_ROLE : null);
  if (!role || (input.minimumRole && !hasMinimumRole(role, input.minimumRole))) {
    throw new AuthorizationError();
  }
  return { userId: input.userId, businessId: input.businessId, role, via: teamRole ? "membership" : "partner" };
}

/** The person's role on the business's own team. A partner open doesn't count. */
export async function requireTeamMembership(
  tx: DatabaseTransaction,
  input: { userId: string; businessId: string; minimumRole?: AuthzRole },
): Promise<{ userId: string; businessId: string; role: AuthzRole }> {
  const role = await readTeamRole(tx, input);
  if (!role || (input.minimumRole && !hasMinimumRole(role, input.minimumRole))) {
    throw new AuthorizationError();
  }
  return { userId: input.userId, businessId: input.businessId, role };
}

export const requireBusinessAdmin = (tx: DatabaseTransaction, input: { userId: string; businessId: string }) =>
  requireBusinessMembership(tx, { ...input, minimumRole: "business_admin" });
