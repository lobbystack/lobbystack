import { headers } from "next/headers";

import { memberships } from "@lobbystack/db";
import { eq } from "drizzle-orm";

import { auth } from "./auth";
import { getAppPool, withDomainTransaction } from "@lobbystack/domain/server";

const TENANT_ADMIN_ROLES = new Set(["business_owner", "business_admin", "owner"]);

export type AuthorizedSession = {
  userId: string;
  sessionId: string;
  email: string | null;
  activeBusinessId: string | null;
};

export async function getSession(): Promise<AuthorizedSession | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return null;
  }

  return {
    userId: session.user.id,
    sessionId: session.session.id,
    email: session.user.email ?? null,
    activeBusinessId:
      typeof (session.user as { activeBusinessId?: string }).activeBusinessId === "string"
        ? (session.user as { activeBusinessId?: string }).activeBusinessId!
        : null,
  };
}

export async function requireSession(): Promise<AuthorizedSession> {
  const session = await getSession();
  if (!session) {
    throw new AuthorizationError("Unauthorized", 401);
  }
  return session;
}

export async function requireBusinessAccess(input: {
  businessId: string;
  userId: string;
  requireAdmin?: boolean;
}): Promise<{ role: string }> {
  const membership = await withDomainTransaction(
    { businessId: input.businessId, userId: input.userId, actorType: "user", pool: getAppPool() },
    async (db) =>
      db
        .select({ role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, input.userId))
        .limit(1),
  );

  const role = membership[0]?.role;
  if (!role) {
    throw new AuthorizationError("Forbidden", 403);
  }

  if (input.requireAdmin && !TENANT_ADMIN_ROLES.has(role)) {
    throw new AuthorizationError("Forbidden", 403);
  }

  return { role };
}

export function hasTenantAdminAccess(role: string | undefined): boolean {
  return role !== undefined && TENANT_ADMIN_ROLES.has(role);
}

export class AuthorizationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}
