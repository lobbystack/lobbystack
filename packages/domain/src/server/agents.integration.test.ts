import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agents, businesses, businessMemberships, createDatabaseClient, rlsContextStatement, users, type Database, type DatabaseTransaction, type RlsContext } from "@lobbystack/db";
import { defaultAgentName, defaultGreeting, runtimeLocales } from "@lobbystack/shared";

import { saveReceptionistProfileInTransaction } from "./receptionistProfile";
import { insertOwnerlessBusinessInTransaction, updateBusinessInTransaction } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Reliability integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

const agentRow = (businessId: string, extra: Partial<typeof agents.$inferInsert> = {}) => ({ businessId, greeting: "Hello", tone: "warm", summary: "Summary", bookingPolicy: "Book", transferMode: "on_request", ...extra });

type Role = "lobbystack_app" | "lobbystack_worker" | "lobbystack_dispatcher" | "lobbystack_readonly";

/** Runs in a transaction that ends before it returns, so another connection sees what it commits. */
async function as<T>(role: Role, context: RlsContext, run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await client!.db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${role}`));
    await tx.execute(rlsContextStatement(context));
    return await run(tx);
  });
}

const failure = async (run: () => Promise<unknown>) => await run().then(() => null, (error: { code?: string; cause?: { code?: string } }) => error.cause?.code ?? error.code ?? "unknown");

describe.skipIf(!client)("several agents in a business", () => {
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;

  beforeEach(async () => {
    businessId = randomUUID();
    otherBusinessId = randomUUID();
    userId = randomUUID();
    await client!.db.insert(businesses).values([
      { id: businessId, slug: `agents-${businessId}`, name: "Clínica Sol", timezone: "UTC", businessType: "test", defaultLocale: "es" },
      { id: otherBusinessId, slug: `agents-${otherBusinessId}`, name: "Other", timezone: "UTC", businessType: "test" },
    ]);
    await client!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await client!.db.insert(businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
  });

  afterEach(async () => {
    await client!.db.delete(businesses).where(eq(businesses.id, businessId));
    await client!.db.delete(businesses).where(eq(businesses.id, otherBusinessId));
    await client!.db.delete(users).where(eq(users.id, userId));
  });

  it("allows any number of agents, and one default", async () => {
    await client!.db.insert(agents).values(agentRow(businessId, { isDefault: true }));
    const [second] = await client!.db.insert(agents).values(agentRow(businessId, { name: "Evening" })).returning({ isDefault: agents.isDefault });
    await client!.db.insert(agents).values(agentRow(businessId, { name: "Weekend" }));
    expect(second).toEqual({ isDefault: false });
    expect(await failure(async () => await client!.db.insert(agents).values(agentRow(businessId, { isDefault: true })))).toBe("23505");
  });

  it.each([
    { role: "lobbystack_app" as const, context: () => ({ businessId, userId, actorType: "operator" as const }) },
    { role: "lobbystack_worker" as const, context: () => ({ businessId, actorType: "worker" as const }) },
  ])("keeps another business's agents out of reach as $role", async ({ role, context }) => {
    await client!.db.insert(agents).values(agentRow(otherBusinessId, { isDefault: true }));
    await as(role, context(), async (tx) => {
      expect(await tx.select({ id: agents.id }).from(agents).where(eq(agents.businessId, otherBusinessId))).toEqual([]);
      expect(await tx.update(agents).set({ greeting: "Taken" }).where(eq(agents.businessId, otherBusinessId)).returning({ id: agents.id })).toEqual([]);
    });
    expect(await failure(async () => await as(role, context(), async (tx) => await tx.insert(agents).values(agentRow(otherBusinessId))))).toBe("42501");
  });

  it("gives the read-only role reads and the dispatcher nothing", async () => {
    await client!.db.insert(agents).values(agentRow(businessId, { isDefault: true }));
    const worker: RlsContext = { businessId, actorType: "worker" };
    expect(await failure(async () => await as("lobbystack_readonly", worker, async (tx) => await tx.update(agents).set({ greeting: "No" })))).toBe("42501");
    expect(await failure(async () => await as("lobbystack_dispatcher", { businessId, actorType: "dispatcher" }, async (tx) => await tx.select({ id: agents.id }).from(agents)))).toBe("42501");
  });

  it("has no view for code from before the rename", async () => {
    const { rows } = await client!.db.execute<{ view: string | null }>(sql`select to_regclass('public.receptionist_profiles')::text as view`);
    expect(rows).toEqual([{ view: null }]);
  });

  it("names each language's agent as @lobbystack/shared does", async () => {
    const { rows } = await client!.db.execute<{ locale: string; name: string }>(sql`select locale, app.default_agent_name(locale) as name from unnest(${sql.raw(`array[${runtimeLocales.map((locale) => `'${locale}'`).join(",")}]::text[]`)}) locale`);
    expect(Object.fromEntries(rows.map((row) => [row.locale, row.name]))).toEqual(Object.fromEntries(runtimeLocales.map((locale) => [locale, defaultAgentName(locale)])));
  });

  it("names an agent for a language tag, and for a value it doesn't know", async () => {
    const { rows } = await client!.db.execute<{ tag: string; other: string }>(sql`select app.default_agent_name('pt-BR') as tag, app.default_agent_name('ja') as other`);
    expect(rows).toEqual([{ tag: "Agente", other: "Agent" }]);
  });
});

describe.skipIf(!client)("a business's default agent", () => {
  const created: string[] = [];
  afterEach(async () => {
    for (const id of created.splice(0)) await client!.db.delete(businesses).where(eq(businesses.id, id));
    vi.unstubAllEnvs();
  });

  async function newBusiness(defaultLocale?: string): Promise<string> {
    const businessId = randomUUID();
    created.push(businessId);
    await as("lobbystack_app", { businessId, actorType: "system" }, async (tx) => await insertOwnerlessBusinessInTransaction(tx, { businessId, name: "Sol", timezone: "UTC", businessType: "test", ...(defaultLocale !== undefined ? { defaultLocale } : {}) }));
    return businessId;
  }
  const agentOf = async (businessId: string) => await client!.db.select({ name: agents.name, isDefault: agents.isDefault, greeting: agents.greeting }).from(agents).where(eq(agents.businessId, businessId));

  it.each([[undefined, "Agent"], ["fr", "Agent"], ["es", "Agente"], ["pt-BR", "Agente"], ["it", "Agente"]])("starts in the language %s", async (locale, name) => {
    const [agent] = await agentOf(await newBusiness(locale));
    expect(agent).toMatchObject({ name, isDefault: true });
  });

  it("follows a change of language until someone renames it", async () => {
    const businessId = await newBusiness();
    const change = async (defaultLocale: string) => await as("lobbystack_app", { businessId, actorType: "system" }, async (tx) => await updateBusinessInTransaction(tx, { businessId, defaultLocale }));
    await change("es");
    expect((await agentOf(businessId))[0]?.name).toBe("Agente");
    await change("de");
    expect((await agentOf(businessId))[0]?.name).toBe("Agent");
    await client!.db.update(agents).set({ name: "Front desk" }).where(eq(agents.businessId, businessId));
    await change("es");
    expect((await agentOf(businessId))[0]?.name).toBe("Front desk");
  });

  it("leaves updated_at alone when only the name follows the language", async () => {
    const businessId = await newBusiness();
    await client!.db.update(agents).set({ greeting: "Our own words", updatedAt: new Date("2026-01-01T00:00:00Z") }).where(eq(agents.businessId, businessId));
    await as("lobbystack_app", { businessId, actorType: "system" }, async (tx) => await updateBusinessInTransaction(tx, { businessId, defaultLocale: "it" }));
    expect((await client!.db.select({ name: agents.name, greeting: agents.greeting, updatedAt: agents.updatedAt }).from(agents).where(eq(agents.businessId, businessId)))[0])
      .toEqual({ name: "Agente", greeting: "Our own words", updatedAt: new Date("2026-01-01T00:00:00Z") });
  });

  it("saves a first profile as the default agent, with its language's name", async () => {
    const businessId = randomUUID();
    created.push(businessId);
    await client!.db.insert(businesses).values({ id: businessId, slug: `first-${businessId}`, name: "Roma", timezone: "UTC", businessType: "test", defaultLocale: "it" });
    await as("lobbystack_worker", { businessId, actorType: "worker" }, async (tx) => await saveReceptionistProfileInTransaction(tx, { businessId, businessName: "Roma", locale: "it", patch: { tone: "warm" } }));
    expect(await agentOf(businessId)).toEqual([{ name: "Agente", isDefault: true, greeting: defaultGreeting("Roma", "it") }]);
  });
});
