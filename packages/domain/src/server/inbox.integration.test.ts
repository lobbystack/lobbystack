import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agents, calls, contacts, conversations, createDatabaseClient, messages, outboxMessages, users, widgetVisitors, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { forgetCachedBrands } from "./brands";
import { requireBusinessAccess } from "./businessAccess";
import { listInboxItems } from "./inbox";
import { createPartnerBusiness, signUpPartner, type PartnerMemberActor } from "./partners";
import { acceptInvitation, createBusiness } from "./tenancy";

// The Inbox query against PostgreSQL, as the app role inside a transaction
// that always rolls back.

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Inbox integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

async function asMigrator<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

async function person(tx: DatabaseTransaction): Promise<{ userId: string; email: string }> {
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  await asMigrator(tx, async () => await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Owner", emailVerified: true }));
  return { userId, email };
}

type World = { tx: DatabaseTransaction; context: { db: Database }; userId: string; businessId: string; frontDesk: string; evening: string };

/** A direct business with its default agent and a second one, "Evening". */
async function withBusiness(run: (world: World) => Promise<void>) {
  await rollbackTest(async (tx) => {
    await tx.execute(sql`set local role lobbystack_app`);
    const { userId } = await person(tx);
    const context = { db: tx as unknown as Database };
    const { businessId } = await createBusiness(context, { userId, name: "Inbox Clinic", timezone: "America/Toronto", businessType: "clinic" });
    const evening = await asMigrator(tx, async () => {
      const [frontDesk] = await tx.update(agents).set({ name: "Front desk" }).where(and(eq(agents.businessId, businessId), eq(agents.isDefault, true))).returning();
      const { id: _id, isDefault: _isDefault, createdAt: _createdAt, updatedAt: _updatedAt, ...settings } = frontDesk!;
      const [created] = await tx.insert(agents).values({ ...settings, name: "Evening", isDefault: false }).returning({ id: agents.id });
      return { frontDesk: frontDesk!.id, evening: created!.id };
    });
    await run({ tx, context, userId, businessId, ...evening });
  });
}

async function seedCall(tx: DatabaseTransaction, input: { businessId: string; agentId: string; transport: string; startedAt: string; contactId?: string; summary?: string }) {
  return await asMigrator(tx, async () => {
    const [conversation] = await tx.insert(conversations).values({ businessId: input.businessId, contactId: input.contactId, channel: input.transport === "web_voice" ? "web_voice" : "voice", agentId: input.agentId, summary: input.summary }).returning({ id: conversations.id });
    const [call] = await tx.insert(calls).values({ businessId: input.businessId, conversationId: conversation!.id, contactId: input.contactId, providerCallId: `call-${randomUUID()}`, transport: input.transport, startedAt: new Date(input.startedAt), agentId: input.agentId }).returning({ id: calls.id });
    return call!.id;
  });
}

async function seedThread(tx: DatabaseTransaction, input: { businessId: string; agentId: string; channel: string; contactId?: string; widgetVisitorId?: string; bodies: Array<[body: string, at: string]> }) {
  return await asMigrator(tx, async () => {
    const [conversation] = await tx.insert(conversations).values({ businessId: input.businessId, contactId: input.contactId, widgetVisitorId: input.widgetVisitorId, channel: input.channel, agentId: input.agentId }).returning({ id: conversations.id });
    if (input.bodies.length) await tx.insert(messages).values(input.bodies.map(([body, at]) => ({ businessId: input.businessId, conversationId: conversation!.id, direction: "inbound", channel: input.channel, body, createdAt: new Date(at) })));
    return conversation!.id;
  });
}

describe.skipIf(!client)("the Inbox against PostgreSQL", () => {
  it("merges calls, texts, website chats and Instagram threads, newest first, each with its agent", async () => {
    await withBusiness(async ({ tx, context, userId, businessId, frontDesk, evening }) => {
      const contact = await asMigrator(tx, async () => (await tx.insert(contacts).values({ businessId, name: "Marie", phone: "+15145550100" }).returning({ id: contacts.id }))[0]!.id);
      const visitorId = randomUUID();
      await asMigrator(tx, async () => await tx.insert(widgetVisitors).values({ id: visitorId, businessId, name: "Web visitor", email: "visitor@example.invalid" }));
      const phoneCall = await seedCall(tx, { businessId, agentId: evening, transport: "voice", startedAt: "2030-01-08T14:00:00Z", contactId: contact, summary: "Asked about fillings" });
      const webCall = await seedCall(tx, { businessId, agentId: frontDesk, transport: "web_voice", startedAt: "2030-01-08T14:30:00Z" });
      const chat = await seedThread(tx, { businessId, agentId: frontDesk, channel: "web_chat", widgetVisitorId: visitorId, bodies: [["Hello", "2030-01-08T14:59:00Z"], ["Do you have parking?", "2030-01-08T15:00:00Z"]] });
      const text = await seedThread(tx, { businessId, agentId: evening, channel: "sms", contactId: contact, bodies: [["Running late", "2030-01-08T16:00:00Z"]] });
      const instagram = await seedThread(tx, { businessId, agentId: evening, channel: "instagram", bodies: [["Are you open Sunday?", "2030-01-08T17:00:00Z"]] });
      await seedThread(tx, { businessId, agentId: frontDesk, channel: "sms", contactId: contact, bodies: [] });

      const page = await listInboxItems(context, { userId, businessId });
      expect(page.items.map((item) => [item.key, item.channel, item.agent?.name, item.preview])).toEqual([
        [`conversation:${instagram}`, "instagram", "Evening", "Are you open Sunday?"],
        [`conversation:${text}`, "sms", "Evening", "Running late"],
        [`conversation:${chat}`, "web_chat", "Front desk", "Do you have parking?"],
        [`call:${webCall}`, "web_call", "Front desk", null],
        [`call:${phoneCall}`, "phone_call", "Evening", "Asked about fillings"],
      ]);
      expect(page.items.find((item) => item.kind === "conversation" && item.channel === "web_chat")).toMatchObject({ contactName: "Web visitor", contactEmail: "visitor@example.invalid", occurredAt: new Date("2030-01-08T15:00:00Z") });
      expect(page.nextCursor).toBeNull();
      expect(page.agents).toEqual([{ id: frontDesk, name: "Front desk" }, { id: evening, name: "Evening" }]);

      const keys = async (filter: Partial<Parameters<typeof listInboxItems>[1]>) => (await listInboxItems(context, { userId, businessId, ...filter })).items.map((item) => item.key);
      expect(await keys({ channel: "phone_call" })).toEqual([`call:${phoneCall}`]);
      expect(await keys({ channel: "web_call" })).toEqual([`call:${webCall}`]);
      expect(await keys({ channel: "instagram" })).toEqual([`conversation:${instagram}`]);
      expect(await keys({ channel: "web_chat" })).toEqual([`conversation:${chat}`]);
      expect(await keys({ agentId: evening })).toEqual([`conversation:${instagram}`, `conversation:${text}`, `call:${phoneCall}`]);
      expect(await keys({ agentId: frontDesk, channel: "sms" })).toEqual([]);
      expect(await keys({ search: "parking" })).toEqual([`conversation:${chat}`]);
      expect(await keys({ search: "Marie" })).toEqual([`conversation:${text}`, `call:${phoneCall}`]);
      expect(await keys({ search: "fillings" })).toEqual([`call:${phoneCall}`]);
    });
  });

  it("keeps an archived agent's name on its history and leaves it out of the agent list", async () => {
    await withBusiness(async ({ tx, context, userId, businessId, frontDesk, evening }) => {
      const callId = await seedCall(tx, { businessId, agentId: evening, transport: "voice", startedAt: "2030-01-08T14:00:00Z" });
      await asMigrator(tx, async () => await tx.update(agents).set({ archivedAt: new Date() }).where(eq(agents.id, evening)));
      const page = await listInboxItems(context, { userId, businessId });
      expect(page.items).toEqual([expect.objectContaining({ key: `call:${callId}`, agent: { id: evening, name: "Evening" } })]);
      expect(page.agents).toEqual([{ id: frontDesk, name: "Front desk" }]);
    });
  });

  it("pages with a cursor that keeps microseconds and ties, skipping and repeating nothing", async () => {
    await withBusiness(async ({ tx, context, userId, businessId, frontDesk }) => {
      // Two calls and two threads at the same instant, and one call a few microseconds later.
      for (let index = 0; index < 2; index += 1) await seedCall(tx, { businessId, agentId: frontDesk, transport: "voice", startedAt: "2030-01-08T14:00:00Z" });
      for (let index = 0; index < 2; index += 1) await seedThread(tx, { businessId, agentId: frontDesk, channel: "sms", bodies: [["Same time", "2030-01-08T14:00:00Z"]] });
      await seedCall(tx, { businessId, agentId: frontDesk, transport: "voice", startedAt: "2030-01-08T13:00:00Z" });
      const micro = await asMigrator(tx, async () => (await tx.insert(calls).values({ businessId, providerCallId: `call-${randomUUID()}`, transport: "pstn", startedAt: new Date("2030-01-08T14:00:00Z"), agentId: frontDesk }).returning({ id: calls.id }))[0]!.id);
      await asMigrator(tx, async () => await tx.execute(sql`update calls set started_at = started_at + interval '7 microseconds' where id = ${micro}`));

      const everything = (await listInboxItems(context, { userId, businessId })).items.map((item) => item.key);
      expect(everything).toHaveLength(6);
      expect(everything[0]).toBe(`call:${micro}`);
      expect(everything.slice(1, 3).every((key) => key.startsWith("conversation:"))).toBe(true);

      const paged: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 10; pages += 1) {
        const page = await listInboxItems(context, { userId, businessId, limit: 1, ...(cursor ? { cursor } : {}) });
        paged.push(...page.items.map((item) => item.key));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      expect(paged).toEqual(everything);
      await expect(listInboxItems(context, { userId, businessId, cursor: "bm9wZQ" })).rejects.toMatchObject({ status: 400, code: "inbox_cursor_invalid" });
    });
  });

  it("lets the owner of an activity-only partner business read it", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      const context = { db: tx as unknown as Database };
      const partnerOwner = await person(tx);
      const businessOwner = await person(tx);
      const { partnerId } = await signUpPartner(context, { userId: partnerOwner.userId, email: partnerOwner.email, emailVerified: true, name: "Acme Reception" });
      const actor: PartnerMemberActor = { kind: "member", partnerId, userId: partnerOwner.userId, role: "owner" };
      const { businessId, invitationId } = await createPartnerBusiness(context, actor, { name: "Pier Clinic", timezone: "America/Toronto", businessType: "dental", accessLevel: "activity", ownerEmail: businessOwner.email });
      const [invite] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
      const token = new URL(String(invite!.payload.url)).searchParams.get("token")!;
      await acceptInvitation(context, { userId: businessOwner.userId, tokenHash: createHash("sha256").update(token).digest("hex"), email: businessOwner.email, emailVerified: true });

      const [defaultAgent] = await asMigrator(tx, async () => await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, businessId), eq(agents.isDefault, true))));
      const text = await seedThread(tx, { businessId, agentId: defaultAgent!.id, channel: "sms", bodies: [["Hi", "2030-01-08T14:00:00Z"]] });
      const brand = { kind: "partner", partnerId } as const;
      const operator = { userId: businessOwner.userId, businessId, brand };
      const check = async (capability: "activity" | "setup") => await withBusinessTransaction(context.db, { userId: businessOwner.userId, businessId, actorType: "operator" }, async (inner) => await requireBusinessAccess(inner, { ...operator, capability }));
      await expect(check("activity")).resolves.toBeDefined();
      await expect(check("setup")).rejects.toMatchObject({ status: 403 });
      const page = await listInboxItems(context, { userId: businessOwner.userId, businessId });
      expect(page.items.map((item) => item.key)).toEqual([`conversation:${text}`]);
      expect(page.agents).toHaveLength(1);
    });
  });
});
