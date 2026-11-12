import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { agents, businesses, createDatabaseClient, rlsContextStatement, type DatabaseTransaction } from "@lobbystack/db";

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

type Summary = { summary: string; summary_source: string; summary_regenerate_status: string | null };

async function asWorker<T>(businessId: string, run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await client!.db.transaction(async (tx) => {
    await tx.execute(sql`set local role lobbystack_worker`);
    await tx.execute(rlsContextStatement({ businessId, actorType: "worker" }));
    return await run(tx);
  });
}

async function agentSummary(agentId: string): Promise<Summary | undefined> {
  return (await client!.db.execute<Summary>(sql`select summary, summary_source, summary_regenerate_status from public.agents where id = ${agentId}::uuid`)).rows[0];
}

async function businessSummary(businessId: string): Promise<Summary | undefined> {
  return (await client!.db.execute<Summary>(sql`select summary, summary_source, summary_regenerate_status from public.businesses where id = ${businessId}::uuid`)).rows[0];
}

// Migration 0215 moved the summary to businesses. Until the release after it,
// the previous release still reads and writes the default agent's columns.
describe.skipIf(!client)("the business summary while the previous release drains", () => {
  let businessId: string;
  let defaultAgentId: string;
  let otherAgentId: string;

  beforeEach(async () => {
    businessId = randomUUID();
    await client!.db.insert(businesses).values({ id: businessId, slug: `summary-${businessId}`, name: "Harbor Dental", timezone: "UTC", businessType: "test", summary: "Harbor Dental uses LobbyStack to answer calls." });
    const settings = { businessId, greeting: "Hi", tone: "warm", bookingPolicy: "Book", transferMode: "never" };
    const [first] = await client!.db.insert(agents).values({ ...settings, isDefault: true, name: "Front desk" }).returning({ id: agents.id });
    const [second] = await client!.db.insert(agents).values({ ...settings, name: "Evening" }).returning({ id: agents.id });
    defaultAgentId = first!.id;
    otherAgentId = second!.id;
  });

  afterEach(async () => {
    await client!.db.delete(businesses).where(eq(businesses.id, businessId));
  });

  it("gives a default agent new code inserts the business's summary", async () => {
    expect(await agentSummary(defaultAgentId)).toEqual({ summary: "Harbor Dental uses LobbyStack to answer calls.", summary_source: "placeholder", summary_regenerate_status: null });
    expect((await agentSummary(otherAgentId))?.summary).toBe("");
  });

  it("copies a summary old code writes on the default agent to the business", async () => {
    await asWorker(businessId, async (tx) => await tx.execute(sql`update public.agents set summary = 'A family dental clinic.', summary_source = 'generated' where id = ${defaultAgentId}::uuid`));
    expect(await businessSummary(businessId)).toEqual({ summary: "A family dental clinic.", summary_source: "generated", summary_regenerate_status: null });
  });

  it("copies a summary new code writes on the business to the default agent, and to no other", async () => {
    await asWorker(businessId, async (tx) => await tx.update(businesses).set({ summary: "Written by the owner.", summarySource: "operator", summaryRegenerateStatus: "pending" }).where(eq(businesses.id, businessId)));
    expect(await agentSummary(defaultAgentId)).toEqual({ summary: "Written by the owner.", summary_source: "operator", summary_regenerate_status: "pending" });
    expect((await agentSummary(otherAgentId))?.summary).toBe("");
  });

  it("leaves the business alone when another agent's summary changes", async () => {
    await client!.db.execute(sql`update public.agents set summary = 'Stale copy', summary_source = 'operator' where id = ${otherAgentId}::uuid`);
    expect((await businessSummary(businessId))?.summary).toBe("Harbor Dental uses LobbyStack to answer calls.");
  });

  it("gives an agent that becomes the default the business's summary", async () => {
    await client!.db.update(businesses).set({ summary: "A family dental clinic.", summarySource: "generated" }).where(eq(businesses.id, businessId));
    await client!.db.transaction(async (tx) => {
      await tx.update(agents).set({ isDefault: false }).where(eq(agents.id, defaultAgentId));
      await tx.update(agents).set({ isDefault: true }).where(eq(agents.id, otherAgentId));
    });
    expect(await agentSummary(otherAgentId)).toMatchObject({ summary: "A family dental clinic.", summary_source: "generated" });
    expect((await businessSummary(businessId))?.summary).toBe("A family dental clinic.");
  });

  it("takes the summary of the first agent old code inserts for a business with none", async () => {
    const otherBusinessId = randomUUID();
    await client!.db.insert(businesses).values({ id: otherBusinessId, slug: `summary-${otherBusinessId}`, name: "Maple", timezone: "UTC", businessType: "test" });
    try {
      await client!.db.execute(sql`insert into public.agents (business_id, is_default, greeting, tone, summary, booking_policy, transfer_mode) values (${otherBusinessId}::uuid, true, 'Hi', 'warm', 'Maple uses LobbyStack to answer calls.', 'Book', 'never')`);
      expect(await businessSummary(otherBusinessId)).toMatchObject({ summary: "Maple uses LobbyStack to answer calls.", summary_source: "placeholder" });
    } finally {
      await client!.db.delete(businesses).where(eq(businesses.id, otherBusinessId));
    }
  });
});
