import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { agents, businesses, createDatabaseClient } from "@lobbystack/db";

import { snapshotForAgent } from "../snapshot";
import { loadLatestBusinessSnapshot, refreshBusinessSnapshot } from "./knowledge";

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

describe.skipIf(!client)("agents in the business snapshot", () => {
  let businessId: string;
  let agentId: string;

  beforeEach(async () => {
    businessId = randomUUID();
    await client!.db.insert(businesses).values({ id: businessId, slug: `snapshot-${businessId}`, name: "Harbor Dental", timezone: "UTC", businessType: "test" });
    const [agent] = await client!.db.insert(agents).values({
      businessId,
      isDefault: true,
      name: "Front desk",
      greeting: "Hi there",
      tone: "warm",
      summary: "Test",
      bookingPolicy: "Book",
      bookingMode: "request",
      transferMode: "on_request",
      transferNumber: "+14165551234",
      voice: "cedar",
      voiceInstructions: "Own voice text",
      staffFirstMode: "always",
      staffFirstNumber: "+14165550001",
    }).returning({ id: agents.id });
    agentId = agent!.id;
    // Left without agent_id, as old code writes it: the trigger assigns the default agent.
    await client!.db.execute(sql`insert into public.agent_rules (business_id, title, content, sort_order) values (${businessId}::uuid, 'Parking', 'Use the rear lot', 0)`);
  });

  afterEach(async () => {
    await client!.db.delete(businesses).where(eq(businesses.id, businessId));
  });

  it("lists the default agent, and projecting it gives the flat fields", async () => {
    await refreshBusinessSnapshot({ db: client!.db }, { businessId });
    const snapshot = (await loadLatestBusinessSnapshot({ db: client!.db }, { businessId }))!;
    expect(snapshot.agents).toHaveLength(1);
    expect(snapshot.agents?.[0]).toMatchObject({ id: agentId, name: "Front desk", isDefault: true, tone: "warm", voice: "cedar", voiceInstructions: "Own voice text", bookingMode: "request" });
    const { agentId: _agentId, agentName: _agentName, tone: _tone, ...projected } = snapshotForAgent(snapshot, agentId)!;
    expect(projected).toEqual(snapshot);
    expect(snapshot.rules?.map((rule) => rule.title)).toEqual(["Parking"]);
    expect(snapshot.agents?.[0]?.rules).toEqual(snapshot.rules);
  });

  it("leaves out an archived agent and keeps the flat fields for old readers", async () => {
    // The guard refuses to archive a default agent, and until slice 5 this is the only agent a business can have.
    await client!.db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.update(agents).set({ archivedAt: new Date() }).where(eq(agents.id, agentId));
    });
    await refreshBusinessSnapshot({ db: client!.db }, { businessId });
    const snapshot = (await loadLatestBusinessSnapshot({ db: client!.db }, { businessId }))!;
    expect(snapshot.agents).toEqual([]);
    expect(snapshot.greeting).toBe("Hi there");
    expect(snapshotForAgent(snapshot, agentId)).toBeNull();
  });
});
