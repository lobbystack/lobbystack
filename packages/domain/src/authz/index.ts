import { eq, and } from "drizzle-orm";

import type { AuthzRole } from "@lobbystack/contracts";
import type { DatabaseTransaction } from "@lobbystack/db";
import { businessMemberships } from "@lobbystack/db";

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

export async function requireBusinessMembership(
  tx: DatabaseTransaction,
  input: { userId: string; businessId: string; minimumRole?: AuthzRole },
): Promise<{ userId: string; businessId: string; role: AuthzRole }> {
  const rows = await tx
    .select({ role: businessMemberships.role })
    .from(businessMemberships)
    .where(and(eq(businessMemberships.userId, input.userId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")))
    .limit(1);
  const membership = rows[0];
  if (!membership || (input.minimumRole && !hasMinimumRole(membership.role, input.minimumRole))) {
    throw new AuthorizationError();
  }
  return { userId: input.userId, businessId: input.businessId, role: membership.role as AuthzRole };
}

export const requireBusinessAdmin = (tx: DatabaseTransaction, input: { userId: string; businessId: string }) =>
  requireBusinessMembership(tx, { ...input, minimumRole: "business_admin" });
