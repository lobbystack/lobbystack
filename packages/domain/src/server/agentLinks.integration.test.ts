import { randomUUID } from "node:crypto";
import { eq, sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { agents, backfillAgentLinks, businesses, businessMemberships, createDatabaseClient, rlsContextStatement, users, type DatabaseTransaction, type RlsContext } from "@lobbystack/db";

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

type Role = "lobbystack_app" | "lobbystack_worker" | "lobbystack_dispatcher" | "lobbystack_auth" | "lobbystack_readonly";

/** Runs in a transaction that ends before it returns, so a deferred foreign key fails here. */
async function as<T>(role: Role, context: RlsContext, run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await client!.db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${role}`));
    await tx.execute(rlsContextStatement(context));
    return await run(tx);
  });
}

const failure = async (run: () => Promise<unknown>) => await run().then(() => null, (error: { code?: string; cause?: { code?: string } }) => error.cause?.code ?? error.code ?? "unknown");
const constraintOf = async (run: () => Promise<unknown>) => await run().then(() => null, (error: { constraint?: string; cause?: { constraint?: string } }) => error.cause?.constraint ?? error.constraint ?? "unknown");

const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const INSUFFICIENT_PRIVILEGE = "42501";

let number = 0;
const e164 = () => { number += 1; return `+1${String(Date.now()).slice(-9)}${String(number).padStart(3, "0")}`; };

type Row = { id: string; agent_id: string | null };

// Each insert is one old code could send, with agent_id left out when it's null.
const links: Array<{ table: string; insert: (businessId: string, agentId?: string) => SQL }> = [
  { table: "phone_numbers", insert: (businessId, agentId) => sql`insert into public.phone_numbers (business_id, e164, provider_phone_id, agent_id) values (${businessId}::uuid, ${e164()}, ${randomUUID()}, ${agentId ?? null}::uuid) returning id, agent_id` },
  { table: "widget_keys", insert: (businessId, agentId) => sql`insert into public.widget_keys (business_id, key_hash, agent_id) values (${businessId}::uuid, ${randomUUID()}, ${agentId ?? null}::uuid) returning id, agent_id` },
  { table: "instagram_accounts", insert: (businessId, agentId) => sql`insert into public.instagram_accounts (business_id, instagram_user_id, encrypted_access_token, token_expires_at, agent_id) values (${businessId}::uuid, ${randomUUID()}, 'token', now() + interval '1 day', ${agentId ?? null}::uuid) returning id, agent_id` },
  { table: "calls", insert: (businessId, agentId) => sql`insert into public.calls (business_id, provider_call_id, transport, started_at, agent_id) values (${businessId}::uuid, ${randomUUID()}, 'voice', now(), ${agentId ?? null}::uuid) returning id, agent_id` },
  { table: "conversations", insert: (businessId, agentId) => sql`insert into public.conversations (business_id, channel, agent_id) values (${businessId}::uuid, 'sms', ${agentId ?? null}::uuid) returning id, agent_id` },
  { table: "agent_rules", insert: (businessId, agentId) => sql`insert into public.agent_rules (business_id, title, content, agent_id) values (${businessId}::uuid, 'Rule', 'Be kind', ${agentId ?? null}::uuid) returning id, agent_id` },
];
const link = (table: string) => links.find((entry) => entry.table === table)!;

/** A row from before the migration: the check and the trigger step aside for this one insert. */
async function oldRow(table: "calls" | "conversations", businessId: string, columns: SQL = sql``, values: SQL = sql``): Promise<string> {
  const id = randomUUID();
  const target = sql.identifier(table);
  const check = sql.identifier(`${table}_agent_id_present`);
  await client!.db.transaction(async (tx) => {
    await tx.execute(sql`alter table public.${target} drop constraint ${check}`);
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(table === "calls"
      ? sql`insert into public.calls (id, business_id, provider_call_id, transport, started_at ${columns}) values (${id}::uuid, ${businessId}::uuid, ${id}, 'voice', now() ${values})`
      : sql`insert into public.conversations (id, business_id, channel ${columns}) values (${id}::uuid, ${businessId}::uuid, 'sms' ${values})`);
    await tx.execute(sql`set local session_replication_role = origin`);
    await tx.execute(sql`alter table public.${target} add constraint ${check} check (agent_id is not null) not valid`);
  });
  return id;
}

async function agentIdOf(table: string, id: string): Promise<string | null | undefined> {
  const result = await client!.db.execute<{ agent_id: string | null }>(sql`select agent_id from public.${sql.identifier(table)} where id = ${id}::uuid`);
  return result.rows[0]?.agent_id;
}

describe.skipIf(!client)("links from channels and history to agents", () => {
  let businessId: string;
  let otherBusinessId: string;
  let bareBusinessId: string;
  let userId: string;
  let agentId: string;
  let otherAgentId: string;

  beforeEach(async () => {
    businessId = randomUUID();
    otherBusinessId = randomUUID();
    bareBusinessId = randomUUID();
    userId = randomUUID();
    await client!.db.insert(businesses).values([
      { id: businessId, slug: `links-${businessId}`, name: "Harbor Dental", timezone: "UTC", businessType: "test" },
      { id: otherBusinessId, slug: `links-${otherBusinessId}`, name: "Other", timezone: "UTC", businessType: "test" },
      { id: bareBusinessId, slug: `links-${bareBusinessId}`, name: "Clínica Sol", timezone: "UTC", businessType: "test", defaultLocale: "es" },
    ]);
    const inserted = await client!.db.insert(agents).values([businessId, otherBusinessId].map((id) => ({ businessId: id, isDefault: true, greeting: "Hi", tone: "warm", summary: "Test", bookingPolicy: "Book", transferMode: "never" }))).returning({ id: agents.id, businessId: agents.businessId });
    agentId = inserted.find((row) => row.businessId === businessId)!.id;
    otherAgentId = inserted.find((row) => row.businessId === otherBusinessId)!.id;
    await client!.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await client!.db.insert(businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
  });

  afterEach(async () => {
    for (const id of [businessId, otherBusinessId, bareBusinessId]) await client!.db.delete(businesses).where(eq(businesses.id, id));
    await client!.db.delete(users).where(eq(users.id, userId));
  });

  const operator = (): RlsContext => ({ businessId, userId, actorType: "operator" });
  const worker = (): RlsContext => ({ businessId, actorType: "worker" });

  describe.each(links)("$table", ({ table, insert }) => {
    it.each([
      { role: "lobbystack_app" as const, context: operator },
      { role: "lobbystack_app" as const, context: (): RlsContext => ({ businessId, actorType: "system" }) },
      { role: "lobbystack_worker" as const, context: worker },
    ])("gets the default agent from the trigger as $role", async ({ role, context }) => {
      const [row] = (await as(role, context(), async (tx) => await tx.execute<Row>(insert(businessId)))).rows;
      expect(row?.agent_id).toBe(agentId);
    });

    it.each(["lobbystack_dispatcher", "lobbystack_auth", "lobbystack_readonly"] as const)("stays closed to %s, which has no write grant", async (role) => {
      expect(await failure(() => as(role, { businessId, actorType: "dispatcher" }, async (tx) => await tx.execute(insert(businessId))))).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it("keeps an agent the insert names", async () => {
      const [row] = (await as("lobbystack_worker", worker(), async (tx) => await tx.execute<Row>(insert(businessId, agentId)))).rows;
      expect(row?.agent_id).toBe(agentId);
    });

    it("rejects another business's agent on insert, for each role and for the owner", async () => {
      expect(await failure(() => as("lobbystack_app", operator(), async (tx) => await tx.execute(insert(businessId, otherAgentId))))).toBe(FOREIGN_KEY_VIOLATION);
      expect(await failure(() => as("lobbystack_worker", worker(), async (tx) => await tx.execute(insert(businessId, otherAgentId))))).toBe(FOREIGN_KEY_VIOLATION);
      expect(await failure(() => client!.db.execute(insert(businessId, otherAgentId)))).toBe(FOREIGN_KEY_VIOLATION);
    });

    it("rejects another business's agent on update", async () => {
      const [row] = (await client!.db.execute<Row>(insert(businessId))).rows;
      const target = sql.identifier(table);
      expect(await failure(() => as("lobbystack_app", operator(), async (tx) => await tx.execute(sql`update public.${target} set agent_id = ${otherAgentId}::uuid where id = ${row!.id}::uuid`)))).toBe(FOREIGN_KEY_VIOLATION);
      expect(await agentIdOf(table, row!.id)).toBe(agentId);
    });

    it("fills a row set back to null, so the check can't fail a write old code never meant", async () => {
      const [row] = (await client!.db.execute<Row>(insert(businessId))).rows;
      await as("lobbystack_worker", worker(), async (tx) => await tx.execute(sql`update public.${sql.identifier(table)} set agent_id = null where id = ${row!.id}::uuid`));
      expect(await agentIdOf(table, row!.id)).toBe(agentId);
    });

    it("gives a business with no agent the default agent it would have got", async () => {
      const [row] = (await as("lobbystack_worker", { businessId: bareBusinessId, actorType: "worker" }, async (tx) => await tx.execute<Row>(insert(bareBusinessId)))).rows;
      const [agent] = await client!.db.select({ id: agents.id, name: agents.name, isDefault: agents.isDefault, greeting: agents.greeting, transferMode: agents.transferMode }).from(agents).where(eq(agents.businessId, bareBusinessId));
      expect(row?.agent_id).toBe(agent?.id);
      expect(agent).toMatchObject({ name: "Agente", isDefault: true, greeting: "Gracias por llamar a Clínica Sol. ¿En qué puedo ayudarle hoy?", transferMode: "on_request" });
    });

    it("creates nothing in a business the row's policy refuses", async () => {
      expect(await failure(() => as("lobbystack_app", operator(), async (tx) => await tx.execute(insert(bareBusinessId))))).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await client!.db.select({ id: agents.id }).from(agents).where(eq(agents.businessId, bareBusinessId))).toEqual([]);
    });
  });

  it("shows the read-only role a channel's agent but still no Instagram token", async () => {
    const context: RlsContext = { businessId, actorType: "system" };
    expect(await failure(() => as("lobbystack_readonly", context, async (tx) => await tx.execute(sql`select agent_id from public.instagram_accounts`)))).toBeNull();
    expect(await failure(() => as("lobbystack_readonly", context, async (tx) => await tx.execute(sql`select encrypted_access_token from public.instagram_accounts`)))).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("doesn't let a runtime role call the function that creates agents", async () => {
    expect(await failure(() => as("lobbystack_worker", worker(), async (tx) => await tx.execute(sql`select app.default_agent_id(${otherBusinessId}::uuid)`)))).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await failure(() => as("lobbystack_app", operator(), async (tx) => await tx.execute(sql`select app.default_agent_id(${otherBusinessId}::uuid)`)))).toBe(INSUFFICIENT_PRIVILEGE);
  });

  describe("old rows", () => {
    it("fills calls and conversations in batches, without changing updated_at", async () => {
      const callId = await oldRow("calls", businessId, sql`, updated_at`, sql`, '2026-01-02T03:04:05Z'`);
      const conversationId = await oldRow("conversations", businessId, sql`, updated_at`, sql`, '2026-01-02T03:04:05Z'`);
      expect(await agentIdOf("calls", callId)).toBeNull();

      const results = await backfillAgentLinks(client!.db, { pauseMs: 0 });

      expect(await agentIdOf("calls", callId)).toBe(agentId);
      expect(await agentIdOf("conversations", conversationId)).toBe(agentId);
      expect(results.map((result) => result.table)).toEqual(["calls", "conversations"]);
      for (const result of results) expect(result.filled).toBeGreaterThanOrEqual(1);
      const stamped = await client!.db.execute<{ updated_at: Date }>(sql`select updated_at from public.calls where id = ${callId}::uuid`);
      expect(new Date(stamped.rows[0]!.updated_at).toISOString()).toBe("2026-01-02T03:04:05.000Z");
    });

    it("skips a row someone holds, and fills it on a later run", async () => {
      const callId = await oldRow("calls", businessId);
      let release = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      let locked = () => {};
      const isLocked = new Promise<void>((resolve) => { locked = resolve; });
      const holder = client!.db.transaction(async (tx) => {
        await tx.execute(sql`select id from public.calls where id = ${callId}::uuid for update`);
        locked();
        await held;
      });
      await isLocked;
      try {
        await backfillAgentLinks(client!.db, { pauseMs: 0 });
        expect(await agentIdOf("calls", callId)).toBeNull();
      } finally {
        release();
        await holder;
      }
      await backfillAgentLinks(client!.db, { pauseMs: 0 });
      expect(await agentIdOf("calls", callId)).toBe(agentId);
    });

    it("stops at its time limit and reports what's left", async () => {
      const callId = await oldRow("calls", businessId);
      const [calls] = await backfillAgentLinks(client!.db, { timeLimitMs: 0 });
      expect(calls).toMatchObject({ table: "calls", filled: 0 });
      expect(calls!.remaining).toBeGreaterThanOrEqual(1);
      await backfillAgentLinks(client!.db, { pauseMs: 0 });
      expect(await agentIdOf("calls", callId)).toBe(agentId);
    });

    it("fills an old row when old code updates it, which the check would otherwise refuse", async () => {
      const callId = await oldRow("calls", businessId);
      const conversationId = await oldRow("conversations", businessId);
      await as("lobbystack_worker", worker(), async (tx) => {
        await tx.execute(sql`update public.calls set status = 'completed' where id = ${callId}::uuid`);
        await tx.execute(sql`update public.conversations set status = 'closed' where id = ${conversationId}::uuid`);
      });
      expect(await agentIdOf("calls", callId)).toBe(agentId);
      expect(await agentIdOf("conversations", conversationId)).toBe(agentId);
    });
  });

  describe("archiving", () => {
    /** Until slice 5 a business has one agent, its default, so this frees the agent from the default rule. */
    const makeNotDefault = async () => await client!.db.update(agents).set({ isDefault: false }).where(eq(agents.id, agentId));
    const archive = async (role: Role, context: RlsContext) => await as(role, context, async (tx) => await tx.update(agents).set({ archivedAt: new Date() }).where(eq(agents.id, agentId)));
    const setStatus = async (table: string, id: string, status: string) => await client!.db.execute(sql`update public.${sql.identifier(table)} set status = ${status} where id = ${id}::uuid`);

    it("refuses the default agent, for each runtime role", async () => {
      expect(await constraintOf(() => archive("lobbystack_app", operator()))).toBe("agents_default_not_archived");
      expect(await constraintOf(() => archive("lobbystack_worker", worker()))).toBe("agents_default_not_archived");
    });

    it("refuses an archived agent as the default", async () => {
      await makeNotDefault();
      await archive("lobbystack_app", operator());
      expect(await constraintOf(() => client!.db.update(agents).set({ isDefault: true }).where(eq(agents.id, agentId)))).toBe("agents_default_not_archived");
    });

    it("archives an agent with no channels, and keeps its history", async () => {
      const [call] = (await client!.db.execute<Row>(link("calls").insert(businessId, agentId))).rows;
      const [rule] = (await client!.db.execute<Row>(link("agent_rules").insert(businessId, agentId))).rows;
      await makeNotDefault();
      await archive("lobbystack_app", operator());
      expect(await agentIdOf("calls", call!.id)).toBe(agentId);
      expect(await agentIdOf("agent_rules", rule!.id)).toBe(agentId);
    });

    describe.each([
      { table: "phone_numbers", live: ["provisioning", "active", "reclaiming"], ended: ["reclaimed", "released"] },
      { table: "widget_keys", live: ["active", "disabled"], ended: ["revoked"] },
      { table: "instagram_accounts", live: ["connected", "reconnect_required"], ended: [] as string[] },
    ])("with $table", ({ table, live, ended }) => {
      it.each(live)("refuses an agent whose channel is %s", async (status) => {
        const [row] = (await client!.db.execute<Row>(link(table).insert(businessId, agentId))).rows;
        await setStatus(table, row!.id, status);
        await makeNotDefault();
        expect(await constraintOf(() => archive("lobbystack_app", operator()))).toBe("agents_archived_without_channels");
        expect(await failure(() => archive("lobbystack_worker", worker()))).toBe(CHECK_VIOLATION);
      });

      it.each(ended)("archives an agent whose channel is %s", async (status) => {
        const [row] = (await client!.db.execute<Row>(link(table).insert(businessId, agentId))).rows;
        await setStatus(table, row!.id, status);
        await makeNotDefault();
        await archive("lobbystack_app", operator());
      });

      it("refuses a new channel on an archived agent", async () => {
        await makeNotDefault();
        await archive("lobbystack_app", operator());
        expect(await constraintOf(() => client!.db.execute(link(table).insert(businessId, agentId)))).toBe("agents_archived_without_channels");
      });

      it("refuses a channel moving to an archived agent", async () => {
        // A business holds one agent until slice 5, so the archived agent is another
        // business's. The guard runs first, because it's a BEFORE trigger and the
        // foreign key waits for the commit.
        const [row] = (await client!.db.execute<Row>(link(table).insert(businessId))).rows;
        await client!.db.update(agents).set({ isDefault: false, archivedAt: new Date() }).where(eq(agents.id, otherAgentId));
        expect(await constraintOf(() => client!.db.execute(sql`update public.${sql.identifier(table)} set agent_id = ${otherAgentId}::uuid where id = ${row!.id}::uuid`))).toBe("agents_archived_without_channels");
      });

      it.each(ended)("refuses a channel coming back from %s on an archived agent", async (status) => {
        const [row] = (await client!.db.execute<Row>(link(table).insert(businessId, agentId))).rows;
        await setStatus(table, row!.id, status);
        await makeNotDefault();
        await archive("lobbystack_app", operator());
        expect(await constraintOf(() => setStatus(table, row!.id, live[0]!))).toBe("agents_archived_without_channels");
      });
    });

    it("doesn't let a channel slip in while the agent is being archived", async () => {
      await makeNotDefault();
      let commit = () => {};
      const committing = new Promise<void>((resolve) => { commit = resolve; });
      let inserted = () => {};
      const isInserted = new Promise<void>((resolve) => { inserted = resolve; });
      const channel = client!.db.transaction(async (tx) => {
        await tx.execute(link("widget_keys").insert(businessId, agentId));
        inserted();
        await committing;
      });
      await isInserted;
      const archiving = constraintOf(() => archive("lobbystack_app", operator()));
      await new Promise((resolve) => setTimeout(resolve, 100));
      commit();
      await channel;
      expect(await archiving).toBe("agents_archived_without_channels");
    });

    it("doesn't let an archive slip in while a channel is being added", async () => {
      await makeNotDefault();
      let commit = () => {};
      const committing = new Promise<void>((resolve) => { commit = resolve; });
      let archived = () => {};
      const isArchived = new Promise<void>((resolve) => { archived = resolve; });
      const archiving = client!.db.transaction(async (tx) => {
        await tx.update(agents).set({ archivedAt: new Date() }).where(eq(agents.id, agentId));
        archived();
        await committing;
      });
      await isArchived;
      const adding = constraintOf(() => client!.db.execute(link("widget_keys").insert(businessId, agentId)));
      await new Promise((resolve) => setTimeout(resolve, 100));
      commit();
      await archiving;
      expect(await adding).toBe("agents_archived_without_channels");
    });
  });

  describe("deletion", () => {
    async function fill(id: string): Promise<void> {
      for (const { insert } of links) await client!.db.execute(insert(id));
    }

    it("deletes a business with every kind of link, as the owner", async () => {
      await fill(businessId);
      await client!.db.delete(businesses).where(eq(businesses.id, businessId));
      expect(await client!.db.select({ id: agents.id }).from(agents).where(eq(agents.businessId, businessId))).toEqual([]);
      for (const { table } of links) {
        const left = await client!.db.execute<{ count: string }>(sql`select count(*)::text as count from public.${sql.identifier(table)} where business_id = ${businessId}::uuid`);
        expect(left.rows[0]?.count).toBe("0");
      }
    });

    it("deletes a business as the worker, the way the deletion job does", async () => {
      await fill(businessId);
      await as("lobbystack_worker", worker(), async (tx) => await tx.delete(businesses).where(eq(businesses.id, businessId)));
      expect(await client!.db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId))).toEqual([]);
    });

    it("leaves other businesses' links alone", async () => {
      await fill(businessId);
      const [call] = (await client!.db.execute<Row>(link("calls").insert(otherBusinessId))).rows;
      await client!.db.delete(businesses).where(eq(businesses.id, businessId));
      expect(await agentIdOf("calls", call!.id)).toBe(otherAgentId);
    });

    it("deletes a business whose old rows the backfill hasn't reached, when the delete also clears their contact", async () => {
      const contactId = randomUUID();
      await client!.db.execute(sql`insert into public.contacts (id, business_id, name) values (${contactId}::uuid, ${businessId}::uuid, 'Sam')`);
      const conversationId = await oldRow("conversations", businessId, sql`, contact_id`, sql`, ${contactId}::uuid`);
      await oldRow("calls", businessId, sql`, contact_id, conversation_id`, sql`, ${contactId}::uuid, ${conversationId}::uuid`);
      await client!.db.delete(businesses).where(eq(businesses.id, businessId));
      expect(await client!.db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId))).toEqual([]);
    });

    it("clears an old row's contact in a live business", async () => {
      const contactId = randomUUID();
      await client!.db.execute(sql`insert into public.contacts (id, business_id, name) values (${contactId}::uuid, ${businessId}::uuid, 'Sam')`);
      const callId = await oldRow("calls", businessId, sql`, contact_id`, sql`, ${contactId}::uuid`);
      await client!.db.execute(sql`delete from public.contacts where id = ${contactId}::uuid`);
      expect(await agentIdOf("calls", callId)).toBe(agentId);
    });

    it("refuses to delete an agent that has history, so it must be archived", async () => {
      await client!.db.execute(link("calls").insert(businessId, agentId));
      expect(await failure(() => as("lobbystack_app", operator(), async (tx) => await tx.delete(agents).where(eq(agents.id, agentId))))).toBe(FOREIGN_KEY_VIOLATION);
      expect(await failure(() => client!.db.delete(agents).where(eq(agents.id, agentId)))).toBe(FOREIGN_KEY_VIOLATION);
    });
  });
});
