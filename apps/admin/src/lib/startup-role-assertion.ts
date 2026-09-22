import { assertDatabaseRole, type DatabaseClient, type DatabaseRole } from "@lobbystack/db";
import { isMaintenanceMode } from "@lobbystack/shared";

import { getDatabase } from "./databases";

export const ADMIN_RUNTIME_DATABASE_ROLES = [
  "lobbystack_app",
  "lobbystack_auth",
  "lobbystack_worker",
  "lobbystack_dispatcher",
] as const satisfies readonly DatabaseRole[];

export type AdminStartupContext = {
  runtime: string | undefined;
  phase: string | undefined;
  environment: Record<string, string | undefined>;
};

export function shouldAssertAdminDatabaseRoles(context: AdminStartupContext): boolean {
  return (
    context.runtime === "nodejs" &&
    context.phase !== "phase-production-build" &&
    context.environment.NODE_ENV === "production" &&
    !isMaintenanceMode(context.environment)
  );
}

export async function assertAdminDatabaseRoles(
  context: AdminStartupContext = {
    runtime: process.env.NEXT_RUNTIME,
    phase: process.env.NEXT_PHASE,
    environment: process.env,
  },
  resolveClient: (role: DatabaseRole) => DatabaseClient = getDatabase,
): Promise<void> {
  if (!shouldAssertAdminDatabaseRoles(context)) return;
  await Promise.all(
    ADMIN_RUNTIME_DATABASE_ROLES.map((role) =>
      assertDatabaseRole(resolveClient(role), context.environment),
    ),
  );
}
