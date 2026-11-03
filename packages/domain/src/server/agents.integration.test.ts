import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { jsonb, pgTable, smallint, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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

// The table as the previous admin and worker know it. They reach it through
// the compatibility view during a deploy, so these queries are theirs.
const oldProfiles = pgTable("receptionist_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull(),
  greeting: text("greeting").notNull(),
  tone: text("tone").notNull(),
  summary: text("summary").notNull(),
  summarySource: varchar("summary_source", { length: 16 }).default("placeholder").notNull(),
  summaryFingerprint: varchar("summary_fingerprint", { length: 64 }),
  summaryGeneratedAt: timestamp("summary_generated_at", { withTimezone: true }),
  summaryRegenerateStatus: varchar("summary_regenerate_status", { length: 16 }),
  bookingPolicy: text("booking_policy").notNull(),
  voiceInstructions: text("voice_instructions"),
  smsInstructions: text("sms_instructions"),
  chatInstructions: text("chat_instructions"),
  transferMode: varchar("transfer_mode", { length: 32 }).notNull(),
  transferNumber: text("transfer_number"),
  appointmentChangePolicy: jsonb("appointment_change_policy"),
  bookingMode: varchar("booking_mode", { length: 16 }).default("instant").notNull(),
  voice: varchar("voice", { length: 32 }).default("marin").notNull(),
  staffFirstMode: varchar("staff_first_mode", { length: 16 }).default("never").notNull(),
  staffFirstNumber: text("staff_first_number"),
  staffFirstRingSeconds: smallint("staff_first_ring_seconds").default(15).notNull(),
  staffFirstMessage: text("staff_first_message"),
  staffFirstHandoverMessage: text("staff_first_handover_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
const oldRow = (businessId: string) => ({ businessId, greeting: "Old greeting", tone: "warm", summary: "Old summary", bookingPolicy: "Book", transferMode: "on_request" });

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

describe.skipIf(!client)("the compatibility view for the previous admin and worker", () => {
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;

  const runtimes: Array<{ role: Role; context: () => RlsContext }> = [
    { role: "lobbystack_app", context: () => ({ businessId, userId, actorType: "operator" }) },
    { role: "lobbystack_worker", context: () => ({ businessId, actorType: "worker" }) },
  ];

  beforeEach(async () => {
    businessId = randomUUID();
    otherBusinessId = randomUUID();
    userId = randomUUID();
    await client!.db.insert(businesses).values([
      { id: businessId, slug: `view-${businessId}`, name: "Clínica Sol", timezone: "UTC", businessType: "test", defaultLocale: "es" },
      { id: otherBusinessId, slug: `view-${otherBusinessId}`, name: "Other", timezone: "UTC", businessType: "test" },
    ]);
    await client!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await client!.db.insert(businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
  });

  afterEach(async () => {
    await client!.db.delete(businesses).where(eq(businesses.id, businessId));
    await client!.db.delete(businesses).where(eq(businesses.id, otherBusinessId));
    await client!.db.delete(users).where(eq(users.id, userId));
  });

  describe.each(runtimes)("as $role", ({ role, context }) => {
    it("inserts a default agent named in the business's language", async () => {
      const [row] = await as(role, context(), async (tx) => await tx.insert(oldProfiles).values(oldRow(businessId)).returning());
      expect(row).toMatchObject({ businessId, greeting: "Old greeting", bookingMode: "instant", voice: "marin" });
      expect(await client!.db.select({ id: agents.id, name: agents.name, isDefault: agents.isDefault, archivedAt: agents.archivedAt }).from(agents).where(eq(agents.businessId, businessId)))
        .toEqual([{ id: row!.id, name: "Agente", isDefault: true, archivedAt: null }]);
    });

    it("upserts on business_id, as saveReceptionistProfileInTransaction did", async () => {
      const upsert = async (greeting: string) => await as(role, context(), async (tx) => await tx.insert(oldProfiles).values({ ...oldRow(businessId), greeting }).onConflictDoUpdate({
        target: oldProfiles.businessId,
        set: { greeting, summarySource: "operator", updatedAt: new Date() },
      }).returning());
      const [created] = await upsert("First");
      const [updated] = await upsert("Second");
      expect(updated).toMatchObject({ id: created!.id, greeting: "Second", summarySource: "operator" });
      expect(await client!.db.select({ greeting: agents.greeting }).from(agents).where(eq(agents.businessId, businessId))).toEqual([{ greeting: "Second" }]);
    });

    it("updates the default agent", async () => {
      await client!.db.insert(agents).values(oldRow(businessId));
      const rows = await as(role, context(), async (tx) => await tx.update(oldProfiles).set({ summary: "New", summarySource: "generated" }).where(eq(oldProfiles.businessId, businessId)).returning({ id: oldProfiles.id }));
      expect(rows).toHaveLength(1);
      expect((await client!.db.select({ summary: agents.summary }).from(agents).where(eq(agents.businessId, businessId)))[0]?.summary).toBe("New");
    });

    it.each(["update", "share"] as const)("holds the agent's row with FOR %s", async (strength) => {
      await client!.db.insert(agents).values(oldRow(businessId));
      await as(role, context(), async (tx) => {
        const rows = await tx.select({ greeting: oldProfiles.greeting }).from(oldProfiles).where(eq(oldProfiles.businessId, businessId)).limit(1).for(strength);
        expect(rows).toEqual([{ greeting: "Old greeting" }]);
        // A writer on another connection has to wait for this transaction.
        expect(await failure(async () => await client!.db.execute(sql`select id from public.agents where business_id = ${businessId} for update nowait`))).toBe("55P03");
      });
    });

    it("keeps another business's agent out of reach", async () => {
      await client!.db.insert(agents).values(oldRow(otherBusinessId));
      await as(role, context(), async (tx) => {
        expect(await tx.select({ id: oldProfiles.id }).from(oldProfiles).where(eq(oldProfiles.businessId, otherBusinessId))).toEqual([]);
        expect(await tx.update(oldProfiles).set({ greeting: "Taken" }).where(eq(oldProfiles.businessId, otherBusinessId)).returning({ id: oldProfiles.id })).toEqual([]);
      });
      expect(await failure(async () => await as(role, context(), async (tx) => await tx.insert(oldProfiles).values(oldRow(otherBusinessId)).onConflictDoNothing()))).toBe("42501");
    });
  });

  it("shows only default agents", async () => {
    await client!.db.insert(agents).values({ ...oldRow(businessId), isDefault: false });
    expect(await as("lobbystack_worker", { businessId, actorType: "worker" }, async (tx) => await tx.select({ id: oldProfiles.id }).from(oldProfiles))).toEqual([]);
  });

  it("gives the read-only role reads and the dispatcher nothing", async () => {
    await client!.db.insert(agents).values(oldRow(businessId));
    const worker: RlsContext = { businessId, actorType: "worker" };
    expect(await failure(async () => await as("lobbystack_readonly", worker, async (tx) => await tx.update(oldProfiles).set({ greeting: "No" })))).toBe("42501");
    expect(await failure(async () => await as("lobbystack_dispatcher", { businessId, actorType: "dispatcher" }, async (tx) => await tx.select({ id: oldProfiles.id }).from(oldProfiles)))).toBe("42501");
  });

  it("gives PUBLIC no privileges on the view", async () => {
    const { rows } = await client!.db.execute<{ grantee: string }>(sql`select grantee from information_schema.role_table_grants where table_schema = 'public' and table_name = 'receptionist_profiles' and grantee = 'PUBLIC'`);
    expect(rows).toEqual([]);
  });

  it("runs as its caller", async () => {
    const { rows } = await client!.db.execute<{ options: string[] }>(sql`select reloptions as options from pg_class where oid = 'public.receptionist_profiles'::regclass`);
    expect(rows[0]?.options).toContain("security_invoker=true");
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
