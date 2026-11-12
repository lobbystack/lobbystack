import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A test chat through the real route, operator access, agent and tools against
// PostgreSQL with the runtime roles. Only the session and the model are fakes.
// It must leave no trace a real chat leaves.

const setup = vi.hoisted(() => {
  const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
  if (testUrl) {
    const url = new URL(testUrl);
    if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
      throw new Error("Test chat integration tests require a dedicated local test database.");
    }
    const roleUrl = (role: string) => {
      const withRole = new URL(testUrl);
      withRole.searchParams.set("options", `-c role=${role}`);
      return withRole.toString();
    };
    process.env.DATABASE_URL = testUrl;
    process.env.LOBBYSTACK_APP_DATABASE_URL = roleUrl("lobbystack_app");
    process.env.LOBBYSTACK_WORKER_DATABASE_URL = roleUrl("lobbystack_worker");
    process.env.APP_BASE_URL = "http://localhost:3000";
    delete process.env.REDIS_URL;
  }
  return { testUrl, userId: "", model: undefined as unknown };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-helpers", async (original) => ({ ...await original<typeof import("@/lib/api-helpers")>(), requireApiSession: async () => ({ user: { id: setup.userId, email: "owner@example.test", emailVerified: true }, session: { id: "session", userId: setup.userId, expiresAt: new Date(0) } }) }));
vi.mock("@lobbystack/agent-core/model", async (original) => ({ ...await original<typeof import("@lobbystack/agent-core/model")>(), createAgentModel: () => setup.model }));
// The worker's database, without the Redis snapshot cache.
vi.mock("@/lib/domain-context", async (original) => {
  const { getWorkerDatabase } = await import("@/lib/api-helpers");
  return { ...await original<typeof import("@/lib/domain-context")>(), createWorkerDomainContext: () => ({ db: getWorkerDatabase().db }) };
});

import { agents, businessMemberships, businesses, createDatabaseClient, phoneNumbers, productEvents, users } from "@lobbystack/db";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

import { GET } from "../test-window/route";
import { POST } from "./route";

const admin = setup.testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: setup.testUrl }) : undefined;
const userId = randomUUID();
const businessId = randomUUID();
const otherBusinessId = randomUUID();
const strangerBusinessId = randomUUID();
const number = `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
const origin = "http://localhost:3000";

function scriptedModel() {
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "1" },
        { type: "text-delta", id: "1", delta: "We open at nine." },
        { type: "text-end", id: "1" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ]),
    }),
  });
  setup.model = model;
  return model;
}

const chat = (body: unknown, business = businessId) => POST(new Request(`${origin}/api/agent/test-chat?businessId=${business}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) }));
const lookUp = (query: string, business = businessId) => GET(new Request(`${origin}/api/agent/test-window?businessId=${business}${query}`));
const defaultAgentId = async (id: string) => (await admin!.db.select({ id: agents.id }).from(agents).where(eq(agents.businessId, id)))[0]!.id;

/** How many rows a chat could have left behind, for the business. */
async function traces() {
  const db = admin!.db;
  const count = async (table: string) => Number((await db.execute<{ rows: string }>(sql`select count(*) as rows from ${sql.identifier(table)} where business_id = ${businessId}`)).rows[0]?.rows);
  const firstReal = await db.select({ id: productEvents.id }).from(productEvents).where(sql`${productEvents.businessId} = ${businessId} and ${productEvents.name} = 'conversation.first_real_recorded'`);
  return {
    conversations: await count("conversations"),
    messages: await count("messages"),
    inboxItems: await count("inbox_items"),
    firstReal: await count("first_real_conversations"),
    firstRealEvents: firstReal.length,
    unanswered: await count("unanswered_questions"),
    usage: await count("billing_usage_events"),
    // The host's cost rollup is the one thing a test chat is allowed to touch.
    outbox: (await db.execute<{ topic: string }>(sql`select topic from outbox_messages where business_id = ${businessId} and topic <> 'billing.refreshUnitEconomics'`)).rows.map((row) => row.topic).sort(),
  };
}

beforeAll(async () => {
  if (!admin) return;
  setup.userId = userId;
  await admin.db.insert(users).values({ id: userId, email: `${userId}@example.test`, normalizedEmail: `${userId}@example.test`, name: "Owner" });
  await admin.db.insert(businesses).values([businessId, otherBusinessId, strangerBusinessId].map((id, index) => ({ id, slug: `test-chat-${id}`, name: ["Acme Dental", "Owner's second", "Stranger"][index]!, timezone: "America/Toronto", businessType: "dental" })));
  for (const [index, id] of [businessId, otherBusinessId, strangerBusinessId].entries()) {
    const name = ["Front desk", "Second desk", "Stranger desk"][index]!;
    await admin.db.insert(agents).values({ businessId: id, name, greeting: "Hello", tone: "warm", bookingPolicy: "Confirm first.", bookingMode: "instant", transferMode: "never", isDefault: true });
  }
  await admin.db.insert(businessMemberships).values([businessId, otherBusinessId].map((id) => ({ businessId: id, userId, role: "business_owner" })));
});

afterAll(async () => {
  if (!admin) return;
  await admin.db.delete(businesses).where(inArray(businesses.id, [businessId, otherBusinessId, strangerBusinessId]));
  await admin.db.delete(users).where(eq(users.id, userId));
  await admin.pool.end();
});

beforeEach(() => { scriptedModel(); });

describe.skipIf(!setup.testUrl)("a test chat", () => {
  it("answers as the agent and leaves no real conversation, usage or first-real event", async () => {
    const agentId = await defaultAgentId(businessId);
    // The first read builds the snapshot, as a first test call would.
    await (await chat({ agentId, messages: [{ role: "user", content: "Hello" }] })).text();
    const model = scriptedModel();
    const before = await traces();

    const response = await chat({ agentId, messages: [{ role: "user", content: "Book me in and tell the team." }] });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("We open at nine.");
    const offered = (model.doStreamCalls[0]?.tools ?? []).map((tool) => tool.name).sort();
    expect(offered).toEqual(["getBusinessHours", "getBusinessServices", "searchKnowledge"]);
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain("private test chat");
    expect(await traces()).toEqual(before);
  });

  it("refuses an agent from another business, even one the operator also belongs to", async () => {
    const model = scriptedModel();
    const before = await traces();
    for (const id of [otherBusinessId, strangerBusinessId]) {
      const response = await chat({ agentId: await defaultAgentId(id), messages: [{ role: "user", content: "Hello" }] });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "agent_not_found" });
    }
    expect(model.doStreamCalls).toHaveLength(0);
    expect(await traces()).toEqual(before);
  });

  it("refuses a business the operator doesn't belong to", async () => {
    const model = scriptedModel();
    const response = await chat({ messages: [{ role: "user", content: "Hello" }] }, strangerBusinessId);
    expect(response.status).toBeGreaterThanOrEqual(403);
    expect(response.status).toBeLessThan(500);
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it("refuses a member below admin", async () => {
    await admin!.db.update(businessMemberships).set({ role: "viewer" }).where(eq(businessMemberships.businessId, otherBusinessId));
    const response = await chat({ messages: [{ role: "user", content: "Hello" }] }, otherBusinessId);
    expect(response.status).toBe(403);
    await admin!.db.update(businessMemberships).set({ role: "business_owner" }).where(eq(businessMemberships.businessId, otherBusinessId));
  });
});

describe.skipIf(!setup.testUrl)("the test window's agent", () => {
  it("names the default agent and the workspace, with no number", async () => {
    const response = await lookUp("");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ agentId: await defaultAgentId(businessId), agentName: "Front desk", businessName: "Acme Dental", phoneNumber: null });
  });

  it("gives the number only while it's active", async () => {
    const agentId = await defaultAgentId(businessId);
    const [row] = await admin!.db.insert(phoneNumbers).values({ businessId, e164: number, agentId, status: "released" }).returning({ id: phoneNumbers.id });
    expect((await (await lookUp(`&agentId=${agentId}`)).json() as { phoneNumber: unknown }).phoneNumber).toBeNull();
    await admin!.db.update(phoneNumbers).set({ status: "active" }).where(eq(phoneNumbers.id, row!.id));
    expect((await (await lookUp(`&agentId=${agentId}`)).json() as { phoneNumber: unknown }).phoneNumber).toBe(number);
    await admin!.db.delete(phoneNumbers).where(eq(phoneNumbers.id, row!.id));
  });

  it("refuses another business's agent and a malformed id", async () => {
    expect((await lookUp(`&agentId=${await defaultAgentId(strangerBusinessId)}`)).status).toBe(404);
    expect((await lookUp(`&agentId=${await defaultAgentId(otherBusinessId)}`)).status).toBe(404);
    expect((await lookUp("&agentId=nope")).status).toBe(400);
    expect((await lookUp("", strangerBusinessId)).status).toBeLessThan(500);
    expect((await lookUp("", strangerBusinessId)).status).toBeGreaterThanOrEqual(403);
  });
});
