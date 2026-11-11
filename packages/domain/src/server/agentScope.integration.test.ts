import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agents, businesses, createDatabaseClient, outboxMessages, phoneNumbers, type DatabaseTransaction, defaultAgentIdOf } from "@lobbystack/db";

import { saveReceptionistProfileInTransaction } from "./receptionistProfile";
import { deleteAgentRuleInTransaction, insertAgentRuleInTransaction, listAgentRulesInTransaction, reorderAgentRulesInTransaction, updateAgentRuleInTransaction } from "./rules";
import { enqueueStaffFirstRouting } from "./staffFirst";

// Settings, rules and number routing act on one agent of a business with two.
// Each test runs as the migrator inside a transaction that always rolls back.

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

type World = { tx: DatabaseTransaction; businessId: string; agentA: string; agentB: string; numberA: string; numberB: string };

async function rolledBack(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      await tx.execute(sql`set constraints all immediate`);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function business(tx: DatabaseTransaction): Promise<string> {
  const businessId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: `agent-scope-${businessId}`, name: "Harbor Dental", timezone: "UTC", businessType: "test", deploymentMode: "cloud" });
  return businessId;
}

/** A business whose default agent answers one number and whose second agent answers another, both on a carrier with staff-first routing. */
async function withTwoAgents(run: (world: World) => Promise<void>) {
  await rolledBack(async (tx) => {
    const businessId = await business(tx);
    const common = { businessId, tone: "warm", summary: "A dental clinic", bookingPolicy: "Book", transferMode: "on_request" as const };
    const [a] = await tx.insert(agents).values({ ...common, isDefault: true, name: "Front desk", greeting: "Front desk here" }).returning({ id: agents.id });
    const [b] = await tx.insert(agents).values({ ...common, isDefault: false, name: "Evening", greeting: "Evening desk here" }).returning({ id: agents.id });
    const [lineA] = await tx.insert(phoneNumbers).values({ businessId, agentId: a!.id, e164: "+15145550101", providerPhoneId: `PN${randomUUID()}`, status: "active", carrier: "twilio", voiceEnabled: true, smsEnabled: true }).returning({ id: phoneNumbers.id });
    const [lineB] = await tx.insert(phoneNumbers).values({ businessId, agentId: b!.id, e164: "+15145550102", providerPhoneId: `PN${randomUUID()}`, status: "active", carrier: "twilio", voiceEnabled: true, smsEnabled: true }).returning({ id: phoneNumbers.id });
    await run({ tx, businessId, agentA: a!.id, agentB: b!.id, numberA: lineA!.id, numberB: lineB!.id });
  });
}

const greetingOf = async (tx: DatabaseTransaction, agentId: string) => (await tx.select({ greeting: agents.greeting }).from(agents).where(eq(agents.id, agentId)))[0]?.greeting;

describe.skipIf(!testUrl)("one agent's settings, rules and routing", () => {
  it("saves settings to the agent named, and to the default agent without one", async () => {
    await withTwoAgents(async ({ tx, businessId, agentA, agentB }) => {
      await saveReceptionistProfileInTransaction(tx, { businessId, agentId: agentB, businessName: "Harbor Dental", patch: { greeting: "Evening, Harbor Dental" } });
      expect([await greetingOf(tx, agentA), await greetingOf(tx, agentB)]).toEqual(["Front desk here", "Evening, Harbor Dental"]);
      await saveReceptionistProfileInTransaction(tx, { businessId, businessName: "Harbor Dental", patch: { greeting: "Morning, Harbor Dental" } });
      expect([await greetingOf(tx, agentA), await greetingOf(tx, agentB)]).toEqual(["Morning, Harbor Dental", "Evening, Harbor Dental"]);
    });
  });

  it("refuses an agent the business doesn't have, or one that's archived", async () => {
    await withTwoAgents(async ({ tx, businessId, agentB }) => {
      await expect(saveReceptionistProfileInTransaction(tx, { businessId, agentId: randomUUID(), businessName: "Harbor Dental", patch: { greeting: "Hi" } })).rejects.toMatchObject({ status: 404, code: "agent_not_found" });
      // An agent can't be archived while it holds a channel.
      await tx.execute(sql`update public.phone_numbers set agent_id = (select id from public.agents where business_id = ${businessId}::uuid and is_default) where business_id = ${businessId}::uuid`);
      await tx.update(agents).set({ archivedAt: new Date() }).where(eq(agents.id, agentB));
      await expect(saveReceptionistProfileInTransaction(tx, { businessId, agentId: agentB, businessName: "Harbor Dental", patch: { greeting: "Hi" } })).rejects.toMatchObject({ status: 404 });
    });
  });

  it("creates the default agent from the defaults when the business has none", async () => {
    await rolledBack(async (tx) => {
      const businessId = await business(tx);
      const saved = await saveReceptionistProfileInTransaction(tx, { businessId, businessName: "Harbor Dental", patch: { greeting: "Hello from Harbor" } });
      expect(saved).toMatchObject({ isDefault: true, greeting: "Hello from Harbor" });
      const again = await saveReceptionistProfileInTransaction(tx, { businessId, businessName: "Harbor Dental", patch: { tone: "calm" } });
      expect(again?.id).toBe(saved?.id);
      expect(await tx.select({ id: agents.id }).from(agents).where(eq(agents.businessId, businessId))).toHaveLength(1);
    });
  });

  it("gives a channel added before the agent a default agent", async () => {
    await rolledBack(async (tx) => {
      const businessId = await business(tx);
      await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: "+15145550109", providerPhoneId: `PN${randomUUID()}`, status: "active" });
      expect(await tx.select({ isDefault: agents.isDefault }).from(agents).where(eq(agents.businessId, businessId))).toEqual([{ isDefault: true }]);
    });
  });

  it("keeps each agent's rules apart, and acts on the default agent's without an agent", async () => {
    await withTwoAgents(async ({ tx, businessId, agentB }) => {
      const day = await insertAgentRuleInTransaction(tx, { businessId, title: "Day rule", content: "Offer mornings" });
      const night = await insertAgentRuleInTransaction(tx, { businessId, agentId: agentB, title: "Night rule", content: "Offer evenings" });
      const late = await insertAgentRuleInTransaction(tx, { businessId, agentId: agentB, title: "Late rule", content: "Offer late slots" });
      expect([day.sortOrder, night.sortOrder, late.sortOrder]).toEqual([0, 0, 1]);
      expect((await listAgentRulesInTransaction(tx, { businessId })).map((rule) => rule.title)).toEqual(["Day rule"]);
      expect((await listAgentRulesInTransaction(tx, { businessId, agentId: agentB })).map((rule) => rule.title)).toEqual(["Night rule", "Late rule"]);

      // Another agent's rule is out of reach.
      expect(await updateAgentRuleInTransaction(tx, { businessId, ruleId: night.id, title: "Moved" })).toBeNull();
      expect(await deleteAgentRuleInTransaction(tx, { businessId, ruleId: night.id })).toBe(false);
      expect(await reorderAgentRulesInTransaction(tx, { businessId, ruleIds: [night.id, day.id] })).toBe(false);

      expect(await reorderAgentRulesInTransaction(tx, { businessId, agentId: agentB, ruleIds: [late.id, night.id] })).toBe(true);
      expect((await listAgentRulesInTransaction(tx, { businessId, agentId: agentB })).map((rule) => rule.title)).toEqual(["Late rule", "Night rule"]);
    });
  });

  it("routes only the agent's numbers when its staff-first setting changes", async () => {
    await withTwoAgents(async ({ tx, businessId, agentB, numberA, numberB }) => {
      await enqueueStaffFirstRouting(tx, businessId, agentB);
      const routed = await tx.select({ aggregateId: outboxMessages.aggregateId }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "phoneNumber.route")));
      expect(routed.map((row) => row.aggregateId)).toEqual([numberB]);
      expect(routed.map((row) => row.aggregateId)).not.toContain(numberA);
    });
  });
});
