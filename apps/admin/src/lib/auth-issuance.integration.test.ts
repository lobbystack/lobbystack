import { createHash, randomUUID } from "node:crypto";
import { runWithAdapter } from "@better-auth/core/context";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "@lobbystack/db";

const state = vi.hoisted(() => ({ clients: {} as Record<string, DatabaseClient>, enqueue: vi.fn(), allowed: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./databases", () => ({ getDatabase: (role: string) => state.clients[role] }));
vi.mock("./email-verification-policy", async original => ({ ...await original<typeof import("./email-verification-policy")>(), assertEmailVerificationSendAllowed: state.allowed }));
vi.mock("@lobbystack/db", async original => ({ ...await original<typeof import("@lobbystack/db")>(), enqueueOutbox: state.enqueue, withBusinessTransaction: async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => callback({}) }));

// Dedicated local fixture: real PG roles, locks, transactions and Better Auth;
// delivery and Redis quotas are isolated from external services.
const url = process.env.LOBBYSTACK_AUTH_TEST_DATABASE_URL;
if (url && (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !/test/i.test(new URL(url).pathname))) {
  throw new Error("Auth integration tests require a dedicated local test database.");
}
const schema = `auth_review_${randomUUID().replaceAll("-", "")}`;
let admin: DatabaseClient | undefined;

beforeAll(async () => {
  if (!url) return;
  admin = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: url });
  await admin.pool.query(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'lobbystack_auth') then create role lobbystack_auth; end if;
      if not exists (select from pg_roles where rolname = 'lobbystack_app') then create role lobbystack_app; end if;
    end $$;
    create schema ${schema};
    create table ${schema}.users (id uuid primary key, email text, email_verified boolean);
    create table ${schema}.verifications (id uuid primary key, identifier text not null, value text not null, expires_at timestamptz not null, created_at timestamptz not null, updated_at timestamptz not null);
    grant usage on schema ${schema} to lobbystack_auth, lobbystack_app;
    grant select on ${schema}.users to lobbystack_auth;
    grant select, insert, update, delete on ${schema}.verifications to lobbystack_auth;
  `);
  for (const role of ["lobbystack_auth", "lobbystack_app"] as const) {
    const scoped = new URL(url);
    scoped.searchParams.set("options", `-c role=${role} -c search_path=${schema}`);
    state.clients[role] = createDatabaseClient(role, { DATABASE_URL: scoped.toString(), LOBBYSTACK_AUTH_POOL_MAX: "2" });
  }
  vi.stubEnv("DATABASE_URL", url);
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-auth-review-secret-long-enough-12345");
});
afterAll(async () => {
  await Promise.all(Object.values(state.clients).map(client => client.pool.end()));
  if (admin) { await admin.pool.query(`drop schema ${schema} cascade`); await admin.pool.end(); }
  vi.unstubAllEnvs();
});

describe.skipIf(!url)("auth issuance with PostgreSQL", () => {
  it("persists with the locked adapter inside signup and rejects overlapping issuance", async () => {
    const email = `${randomUUID()}@example.invalid`;
    await admin!.pool.query(`insert into ${schema}.users values ($1, $2, false)`, [randomUUID(), email]);
    let release!: () => void;
    state.enqueue.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const { issueEmailVerificationCode } = await import("./auth");
    // A poisoned enclosing adapter exposes accidental inheritance immediately.
    const outer = { create: () => { throw new Error("OTP escaped its PG transaction"); } } as any;
    const first = runWithAdapter(outer, () => issueEmailVerificationCode(email));
    try {
      await vi.waitFor(() => expect(state.enqueue).toHaveBeenCalledOnce());
      expect((await admin!.pool.query(`select * from ${schema}.verifications`)).rows).toHaveLength(0);
      await expect(issueEmailVerificationCode(email.toUpperCase())).rejects.toThrow("Please wait");
    } finally { release?.(); }
    await expect(first).resolves.toBe(true);
    const rows = (await admin!.pool.query(`select * from ${schema}.verifications`)).rows;
    const otp = state.enqueue.mock.calls[0]![1].payload.variables.code;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ identifier: `email-verification-otp-${email}`, value: `${createHash("sha256").update(otp).digest("base64url")}:0` });
    expect(state.allowed).toHaveBeenCalledOnce();
    state.enqueue.mockRejectedValueOnce(new Error("delivery unavailable"));
    await expect(issueEmailVerificationCode(email)).rejects.toThrow("delivery unavailable");
    expect((await admin!.pool.query(`select * from ${schema}.verifications`)).rows).toHaveLength(1);
  });
});
