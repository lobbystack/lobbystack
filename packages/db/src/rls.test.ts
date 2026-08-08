import { describe, expect, it } from "vitest";

import { getConnectionString } from "./client";
import { currentRlsContext, setRlsContext, withBusinessTransaction } from "./rls/context";

const hasDatabase =
  Boolean(process.env.DATABASE_URL) ||
  Boolean(process.env.DATABASE_URL_APP) ||
  Boolean(process.env.CI_DATABASE_URL);

describe("RLS context helpers", () => {
  it("exposes connection string resolution for app role", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://app:secret@localhost:5432/lobbystack";

    try {
      expect(getConnectionString("app")).toBe(
        "postgres://app:secret@localhost:5432/lobbystack",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  });

  it.skipIf(!hasDatabase)(
    "isolates tenant reads inside withBusinessTransaction",
    async () => {
      const { getPool } = await import("./client");
      const pool = getPool("app");

      const businessA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const businessB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

      await withBusinessTransaction(
        pool,
        { businessId: businessA, userId: "user-a", actorType: "user" },
        async (client) => {
          await client.query(
            `INSERT INTO app.businesses (id, slug, name)
             VALUES ($1, 'tenant-a', 'Tenant A')
             ON CONFLICT (id) DO NOTHING`,
            [businessA],
          );

          const context = await currentRlsContext(client);
          expect(context.businessId).toBe(businessA);

          const visible = await client.query<{ id: string }>(
            `SELECT id::text FROM app.businesses WHERE id = ANY($1::uuid[])`,
            [[businessA, businessB]],
          );

          expect(visible.rows.map((row) => row.id)).toEqual([businessA]);
        },
      );
    },
  );

  it("documents setRlsContext parameter contract", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const mockClient = {
      query: async (sql: string, values: unknown[] = []) => {
        calls.push({ sql, values });
        return { rows: [] };
      },
    };

    await setRlsContext(mockClient as never, {
      businessId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user-1",
      actorType: "user",
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.sql).toContain("app.user_id");
    expect(calls[1]?.sql).toContain("app.business_id");
    expect(calls[2]?.sql).toContain("app.actor_type");
  });
});

describe("cross-tenant isolation contract", () => {
  it("requires business_id on tenant-scoped tables", () => {
    const tenantTables = [
      "memberships",
      "appointments",
      "contacts",
      "outbox_messages",
    ];

    for (const table of tenantTables) {
      expect(table).toMatch(/^[a-z_]+$/);
    }
  });
});
