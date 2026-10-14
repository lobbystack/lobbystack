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
  wait: { attempts: number; delayMs: number } = { attempts: 60, delayMs: 5_000 },
): Promise<void> {
  if (!shouldAssertAdminDatabaseRoles(context)) return;
  // A fresh deploy can start the admin before migrate gives the roles their logins, and a
  // failed startup check keeps the admin answering 500 until it restarts, so wait for migrate.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await Promise.all(
        ADMIN_RUNTIME_DATABASE_ROLES.map((role) =>
          assertDatabaseRole(resolveClient(role), context.environment),
        ),
      );
      return;
    } catch (error) {
      // A role that connects with too much privilege is a misconfiguration, so fail at once.
      if (attempt >= wait.attempts || (error instanceof Error && error.message.startsWith("Database role assertion failed"))) throw error;
      await new Promise((resolve) => setTimeout(resolve, wait.delayMs));
    }
  }
}
