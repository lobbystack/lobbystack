import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, DatabaseRole } from "@lobbystack/db";

import {
  ADMIN_RUNTIME_DATABASE_ROLES,
  assertAdminDatabaseRoles,
  shouldAssertAdminDatabaseRoles,
  type AdminStartupContext,
} from "./startup-role-assertion";

function stubClient(role: DatabaseRole, rows: Array<{ role: string; privileged: boolean }>) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { client: { role, pool: { query } } as unknown as DatabaseClient, query };
}

const production: AdminStartupContext = {
  runtime: "nodejs",
  phase: undefined,
  environment: { NODE_ENV: "production" },
};

describe("admin startup database role assertion", () => {
  it("covers every runtime role the admin process connects with", () => {
    expect([...ADMIN_RUNTIME_DATABASE_ROLES]).toEqual([
      "lobbystack_app",
      "lobbystack_auth",
      "lobbystack_worker",
      "lobbystack_dispatcher",
    ]);
  });

  it("passes when each runtime client connects as its own unprivileged role", async () => {
    const clients = new Map<DatabaseRole, ReturnType<typeof stubClient>>();
    for (const role of ADMIN_RUNTIME_DATABASE_ROLES) {
      clients.set(role, stubClient(role, [{ role, privileged: false }]));
    }
    const resolveClient = vi.fn((role: DatabaseRole) => clients.get(role)!.client);

    await expect(assertAdminDatabaseRoles(production, resolveClient)).resolves.toBeUndefined();

    expect(resolveClient).toHaveBeenCalledTimes(ADMIN_RUNTIME_DATABASE_ROLES.length);
    for (const role of ADMIN_RUNTIME_DATABASE_ROLES) {
      expect(clients.get(role)!.query).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects when a single runtime client falls back to the privileged base role", async () => {
    const resolveClient = vi.fn((role: DatabaseRole) => (
      role === "lobbystack_dispatcher"
        ? stubClient(role, [{ role: "postgres", privileged: true }]).client
        : stubClient(role, [{ role, privileged: false }]).client
    ));

    await expect(assertAdminDatabaseRoles(production, resolveClient)).rejects.toThrow(
      "Database role assertion failed",
    );
  });

  it.each([
    ["development", { ...production, environment: { NODE_ENV: "development" } }],
    ["production build", { ...production, phase: "phase-production-build" }],
    ["edge runtime", { ...production, runtime: "edge" }],
    ["maintenance mode", { ...production, environment: { NODE_ENV: "production", LOBBYSTACK_MAINTENANCE_MODE: "true" } }],
  ] as const)("skips %s without touching a client", async (_label, context) => {
    const resolveClient = vi.fn();

    expect(shouldAssertAdminDatabaseRoles(context)).toBe(false);
    await expect(assertAdminDatabaseRoles(context, resolveClient)).resolves.toBeUndefined();
    expect(resolveClient).not.toHaveBeenCalled();
  });

  it("only enables the assertion for node in unmaintained production", () => {
    expect(shouldAssertAdminDatabaseRoles(production)).toBe(true);
  });
});
