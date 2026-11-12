import { randomUUID } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { agentRules, agents, createDatabaseClient, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { createBusiness, getBusinessSnapshotForAgent, NEW_BUSINESS_AGENT_INSTRUCTIONS, refreshBusinessSnapshot } from "@lobbystack/domain";

import { buildAgentInstructions, buildLiveInstructions } from "./instructions";

// A new business's default call and text instructions, from creating it
// against PostgreSQL to the prompts its calls and texts read. Each test rolls back.

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("New business rule integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

async function as(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker" | null) {
  await tx.execute(sql`reset role`);
  if (role) await tx.execute(sql.raw(`set local role ${role}`));
}

describe.skipIf(!testUrl)("a new business's default instructions", () => {
  it("are call and text rules titled in its language, and reach the call and text prompts", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Owner" });
      const context = { db: tx as unknown as Database };
      await as(tx, "lobbystack_app");
      const { businessId } = await createBusiness(context, { userId, name: "Clinique Harbor", timezone: "America/Toronto", businessType: "clinic", defaultLocale: "fr" });
      await as(tx, null);

      const [agent] = await tx.select({ id: agents.id, voiceInstructions: agents.voiceInstructions, smsInstructions: agents.smsInstructions, chatInstructions: agents.chatInstructions }).from(agents).where(eq(agents.businessId, businessId));
      // The deprecated columns stay empty.
      expect(agent).toMatchObject({ voiceInstructions: null, smsInstructions: null, chatInstructions: null });
      const rules = await tx.select({ title: agentRules.title, content: agentRules.content, channel: agentRules.channel, active: agentRules.active }).from(agentRules).where(eq(agentRules.agentId, agent!.id)).orderBy(asc(agentRules.sortOrder));
      expect(rules).toEqual([
        { title: "Pendant les appels", content: NEW_BUSINESS_AGENT_INSTRUCTIONS.voiceInstructions, channel: "voice", active: true },
        { title: "Par texto", content: NEW_BUSINESS_AGENT_INSTRUCTIONS.smsInstructions, channel: "sms", active: true },
      ]);

      await as(tx, "lobbystack_worker");
      await refreshBusinessSnapshot(context, { businessId });
      const snapshot = (await getBusinessSnapshotForAgent(context, { businessId, agentId: agent!.id }))!;
      await as(tx, null);

      const call = buildLiveInstructions(snapshot, "voice");
      expect(call).toContain(NEW_BUSINESS_AGENT_INSTRUCTIONS.voiceInstructions);
      expect(call).not.toContain(NEW_BUSINESS_AGENT_INSTRUCTIONS.smsInstructions);
      const text = buildAgentInstructions(snapshot, { channel: "sms", callerPhone: "+14165550100" });
      expect(text).toContain(NEW_BUSINESS_AGENT_INSTRUCTIONS.smsInstructions);
      expect(text).not.toContain(NEW_BUSINESS_AGENT_INSTRUCTIONS.voiceInstructions);
      // Website chat follows neither.
      const chat = buildAgentInstructions(snapshot, { channel: "web_chat" });
      expect(chat).not.toContain(NEW_BUSINESS_AGENT_INSTRUCTIONS.smsInstructions);
      expect(chat).not.toContain(NEW_BUSINESS_AGENT_INSTRUCTIONS.voiceInstructions);
    });
  });
});
