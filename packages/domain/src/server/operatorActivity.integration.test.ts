import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, businessMemberships, businesses, calls, contacts, conversations, createDatabaseClient, messages, services, staff, transcripts, users, widgetVisitors, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { getAnalytics } from "./analytics";
import { deleteContact, getContactDetail, listContacts } from "./contacts";
import { appendMessage, getOrCreateWidgetConversation, registerWidgetVisitor } from "./conversations";
import { listCurrentAppointments, listRecentCalls, listUpcomingAppointments } from "./operatorActivity";
import { listCalls } from "./voice";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Operator activity integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

/** One business with a named phone caller, a phone-only caller, a web caller, and a website chat visitor. */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userId = randomUUID();
  const ids = { named: randomUUID(), phoneOnly: randomUUID(), webCaller: randomUUID(), chatVisitor: randomUUID() };
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Contact labels test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
  await tx.insert(contacts).values([
    { id: ids.named, businessId, name: "Marie Tremblay", phone: "+14155550100", email: "marie@example.com" },
    { id: ids.phoneOnly, businessId, phone: "+14155550123" },
    { id: ids.webCaller, businessId },
    { id: ids.chatVisitor, businessId, email: "visitor@example.com" },
  ]);
  const call = async (contactId: string, transport: string, minutesAgo: number) => {
    const conversationId = randomUUID();
    await tx.insert(conversations).values({ id: conversationId, businessId, contactId, channel: "voice" });
    await tx.insert(calls).values({ businessId, conversationId, contactId, provider: "openai_live", providerCallId: `rtc_${randomUUID()}`, transport, status: "completed", startedAt: new Date(Date.now() - minutesAgo * 60_000) });
  };
  await call(ids.named, "voice", 40);
  await call(ids.phoneOnly, "voice", 30);
  await call(ids.webCaller, "web_voice", 20);
  const smsConversationId = randomUUID();
  await tx.insert(conversations).values({ id: smsConversationId, businessId, contactId: ids.named, channel: "sms" });
  const visitorId = randomUUID();
  await tx.insert(widgetVisitors).values({ id: visitorId, businessId, contactId: ids.chatVisitor, email: "visitor@example.com" });
  // Website chats name their contact, as they do once the visitor is linked.
  const visitorChatId = randomUUID();
  const linkedChatId = randomUUID();
  await tx.insert(conversations).values([
    { id: visitorChatId, businessId, contactId: ids.chatVisitor, widgetVisitorId: visitorId, channel: "web_chat" },
    { id: linkedChatId, businessId, contactId: ids.chatVisitor, widgetVisitorId: visitorId, channel: "web_chat" },
  ]);
  const message = (conversationId: string, channel: string, direction: "inbound" | "outbound", minutesAgo: number) => ({ businessId, conversationId, channel, direction, body: `${channel} ${direction}`, createdAt: new Date(Date.now() - minutesAgo * 60_000) });
  await tx.insert(messages).values([
    message(smsConversationId, "sms", "inbound", 50),
    message(smsConversationId, "sms", "outbound", 49),
    message(visitorChatId, "web_chat", "inbound", 15),
    message(visitorChatId, "web_chat", "outbound", 14),
    message(visitorChatId, "dashboard", "outbound", 12),
    message(linkedChatId, "web_chat", "inbound", 5),
  ]);
  const [employee] = await tx.insert(staff).values({ businessId, name: "Sam", timezone: "UTC" }).returning();
  const [service] = await tx.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 }).returning();
  const startsAt = new Date(Date.now() + 86_400_000);
  await tx.insert(appointments).values({ businessId, contactId: ids.webCaller, staffId: employee!.id, serviceId: service!.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "UTC", sourceChannel: "web_voice" });
  await tx.execute(sql`set local role lobbystack_app`);
  return { db: tx as unknown as Database, businessId, userId, ids };
}

describe.skipIf(!client)("operator contact and channel data under operator RLS", () => {
  it("lists the channels each contact used without changing names or numbers", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId, ids } = await seed(tx);
      const result = await listContacts({ db }, { userId, businessId });
      const byId = new Map(result.contacts.map((contact) => [contact.id, contact]));
      expect(byId.get(ids.named)).toMatchObject({ name: "Marie Tremblay", phone: "+14155550100", email: "marie@example.com", channels: ["sms", "voice"] });
      expect(byId.get(ids.phoneOnly)).toMatchObject({ name: null, phone: "+14155550123", email: null, channels: ["voice"] });
      expect(byId.get(ids.webCaller)).toMatchObject({ name: null, phone: null, email: null, channels: ["web_voice"] });
      expect(byId.get(ids.chatVisitor)).toMatchObject({ name: null, phone: null, email: "visitor@example.com", channels: ["web_chat"] });

      const detail = await getContactDetail({ db }, { userId, businessId, contactId: ids.webCaller });
      expect(detail.channels).toEqual(["web_voice"]);
      expect(detail.contact).toMatchObject({ id: ids.webCaller, name: null, phone: null });
    });
  });

  it("counts website chat messages on the contact", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId, ids } = await seed(tx);
      const result = await listContacts({ db }, { userId, businessId });
      const counts = new Map(result.contacts.map((contact) => [contact.id, Number(contact.messageCount)]));
      expect(Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, counts.get(id)]))).toEqual({ named: 2, phoneOnly: 0, webCaller: 0, chatVisitor: 4 });

      const detail = await getContactDetail({ db }, { userId, businessId, contactId: ids.chatVisitor });
      expect(detail.activityCounts).toEqual({ calls: 0, messages: 4, appointments: 0, conversations: 2 });
      expect(detail.messages.map((message) => [message.channel, message.direction])).toEqual([
        ["web_chat", "inbound"],
        ["dashboard", "outbound"],
        ["web_chat", "outbound"],
        ["web_chat", "inbound"],
      ]);

      const named = await getContactDetail({ db }, { userId, businessId, contactId: ids.named });
      expect(named.activityCounts).toEqual({ calls: 1, messages: 2, appointments: 0, conversations: 2 });
    });
  });

  it("gives website chats and web calls their own analytics channels and keeps the totals", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId } = await seed(tx);
      const to = new Date(Date.now() + 60_000);
      const from = new Date(to.getTime() - 86_400_000);
      const result = await getAnalytics({ db }, { userId, businessId, from, to, previousFrom: new Date(from.getTime() - 86_400_000), granularity: "day" });
      // The staff reply in the website chat counts as website chat, not Other.
      expect(result.channels).toEqual({ phone_call: 2, web_call: 1, sms: 2, web_chat: 4, other: 0 });
      expect(Object.values(result.channels).reduce((sum, count) => sum + count, 0)).toBe(result.calls.current + result.messages.current);
    });
  });

  it("counts open calls as live and a call open past its max duration as missed", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId } = await seed(tx);
      await tx.execute(sql`reset role`);
      const open = (transport: string, minutesAgo: number) => ({ businessId, provider: "openai_live", providerCallId: `rtc_${randomUUID()}`, transport, startedAt: new Date(Date.now() - minutesAgo * 60_000), ...(transport === "web_voice" ? { webCallMaxDurationMs: 300_000 } : {}) });
      await tx.insert(calls).values([open("voice", 2), open("web_voice", 1), open("web_voice", 60), open("voice", 3 * 60)]);
      await tx.execute(sql`set local role lobbystack_app`);
      const to = new Date(Date.now() + 60_000);
      const from = new Date(to.getTime() - 86_400_000);
      const result = await getAnalytics({ db }, { userId, businessId, from, to, previousFrom: new Date(from.getTime() - 86_400_000), granularity: "day" });
      expect(result.outcomes).toEqual([{ outcome: "completed", count: 3 }, { outcome: "transferred", count: 0 }, { outcome: "live", count: 2 }, { outcome: "missed", count: 2 }]);
    });
  });

  it("finds a call by the transcript text the call list shows", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId } = await seed(tx);
      await tx.execute(sql`reset role`);
      const [webCall] = await tx.select({ id: calls.id }).from(calls).where(and(eq(calls.businessId, businessId), eq(calls.transport, "web_voice")));
      await tx.insert(transcripts).values({ businessId, callId: webCall!.id, sequence: 1, speaker: "caller", text: "Do you fix leaky faucets?" });
      await tx.execute(sql`set local role lobbystack_app`);
      const found = await listCalls({ db }, { userId, businessId, search: "faucet" });
      expect(found.calls.map((call) => call.id)).toEqual([webCall!.id]);
      expect(found.pagination.total).toBe(1);
    });
  });

  it("returns the call transport and contact details the call lists label callers with", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId } = await seed(tx);
      const listed = await listCalls({ db }, { userId, businessId });
      expect(listed.calls.map((call) => ({ transport: call.transport, contactPhone: call.contactPhone, contactEmail: call.contactEmail }))).toEqual([
        { transport: "web_voice", contactPhone: null, contactEmail: null },
        { transport: "voice", contactPhone: "+14155550123", contactEmail: null },
        { transport: "voice", contactPhone: "+14155550100", contactEmail: "marie@example.com" },
      ]);

      await withBusinessTransaction(db, { businessId, userId, actorType: "operator" }, async (appTx) => {
        const recent = await listRecentCalls(appTx, businessId);
        expect(recent[0]).toMatchObject({ transport: "web_voice", contactName: null, contactPhone: null, contactEmail: null });
        expect(recent[2]).toMatchObject({ transport: "voice", contactName: "Marie Tremblay", contactEmail: "marie@example.com" });
      });
    });
  });

  it("returns appointment sources with the contact's phone and email", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId } = await seed(tx);
      await withBusinessTransaction(db, { businessId, userId, actorType: "operator" }, async (appTx) => {
        const expected = { sourceChannel: "web_voice", contactName: null, contactPhone: null, contactEmail: null, serviceName: "Consultation", staffName: "Sam" };
        expect(await listUpcomingAppointments(appTx, businessId, new Date())).toEqual([expect.objectContaining(expected)]);
        expect(await listCurrentAppointments(appTx, businessId, new Date())).toEqual([expect.objectContaining(expected)]);
      });
    });
  });
});

/** A business with an owner; widget calls run as the worker role and dashboard reads as the app role. */
async function seedWidgetBusiness(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Website chat contacts test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
  const db = tx as unknown as Database;
  const as = async (role: "lobbystack_worker" | "lobbystack_app") => { await tx.execute(sql.raw(`set local role ${role}`)); };
  const chat = async (visitorId: string, ...bodies: string[]) => {
    await as("lobbystack_worker");
    await registerWidgetVisitor({ db }, { businessId, visitorId });
    const { conversationId } = await getOrCreateWidgetConversation({ db }, { businessId, widgetVisitorId: visitorId });
    for (const body of bodies) await appendMessage({ db }, { businessId, conversationId, body, direction: "inbound", channel: "web_chat" });
    return conversationId;
  };
  const lead = async (visitorId: string, email: string) => {
    await as("lobbystack_worker");
    return (await registerWidgetVisitor({ db }, { businessId, visitorId, name: email, email })).contactId;
  };
  const detail = async (contactId: string) => {
    await as("lobbystack_app");
    return await getContactDetail({ db }, { userId, businessId, contactId });
  };
  const listedMessageCount = async (contactId: string) => {
    await as("lobbystack_app");
    const listed = await listContacts({ db }, { userId, businessId });
    return Number(listed.contacts.find((contact) => contact.id === contactId)?.messageCount);
  };
  const conversationContact = async (conversationId: string) => {
    await tx.execute(sql`reset role`);
    return (await tx.select({ contactId: conversations.contactId }).from(conversations).where(eq(conversations.id, conversationId)))[0]?.contactId ?? null;
  };
  return { db, businessId, userId, as, chat, lead, detail, listedMessageCount, conversationContact };
}

describe.skipIf(!client)("website chat attribution under RLS", () => {
  it("gives a visitor's earlier and later chats to the contact it becomes, counted once", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, chat, lead, detail, listedMessageCount, conversationContact } = await seedWidgetBusiness(tx);
      const visitorId = randomUUID();
      const before = await chat(visitorId, "Do you take walk-ins?", "Around noon?");
      const contactId = (await lead(visitorId, "ana@example.com"))!;
      expect(await conversationContact(before)).toBe(contactId);

      await withBusinessTransaction(db, { businessId, actorType: "worker" }, async (workerTx) => {
        await workerTx.update(conversations).set({ status: "closed" }).where(and(eq(conversations.id, before), eq(conversations.businessId, businessId)));
      });
      const after = await chat(visitorId, "Back again");
      expect(after).not.toBe(before);
      expect(await conversationContact(after)).toBe(contactId);

      expect(await listedMessageCount(contactId)).toBe(3);
      const result = await detail(contactId);
      expect(result.activityCounts).toEqual({ calls: 0, messages: 3, appointments: 0, conversations: 2 });
      expect(result.channels).toEqual(["web_chat"]);
    });
  });

  it("keeps a linked visitor's chats with its contact when the browser gives someone else's details", async () => {
    await rollbackTest(async (tx) => {
      const { chat, lead, detail, conversationContact } = await seedWidgetBusiness(tx);
      const visitorId = randomUUID();
      const conversationId = await chat(visitorId, "I'm Ana");
      const ana = (await lead(visitorId, "ana@example.com"))!;
      expect(await lead(visitorId, "ben@example.com")).toBe(ana);
      expect(await conversationContact(conversationId)).toBe(ana);
      expect((await detail(ana)).activityCounts.messages).toBe(1);
    });
  });

  it("refuses to delete a contact while its widget visitor has chats", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId, as, chat, lead } = await seedWidgetBusiness(tx);
      const visitorId = randomUUID();
      await chat(visitorId, "I'm Ana");
      const ana = (await lead(visitorId, "ana@example.com"))!;
      await as("lobbystack_app");
      await expect(deleteContact({ db }, { userId, businessId, contactId: ana })).rejects.toMatchObject({ status: 409 });

      // A chat that never got its contact still blocks the deletion.
      await tx.execute(sql`reset role`);
      await tx.update(conversations).set({ contactId: null }).where(eq(conversations.widgetVisitorId, visitorId));
      await as("lobbystack_app");
      await expect(deleteContact({ db }, { userId, businessId, contactId: ana })).rejects.toMatchObject({ status: 409 });
    });
  });

  it("never hands a deleted contact's chats to the next person on the same browser", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId, as, chat, lead, detail, listedMessageCount, conversationContact } = await seedWidgetBusiness(tx);
      const visitorId = randomUUID();
      // Ana gives her details before chatting, so the dashboard can delete her.
      await as("lobbystack_worker");
      await registerWidgetVisitor({ db }, { businessId, visitorId });
      const ana = (await lead(visitorId, "ana@example.com"))!;
      await as("lobbystack_app");
      expect(await deleteContact({ db }, { userId, businessId, contactId: ana })).toBe(true);

      // Ana's chat from before this change was never attributed and outlived her
      // contact, which is what the backfill leaves behind for deleted contacts.
      await tx.execute(sql`reset role`);
      const [visitor] = await tx.select({ contactId: widgetVisitors.contactId, contactLinkedAt: widgetVisitors.contactLinkedAt }).from(widgetVisitors).where(eq(widgetVisitors.id, visitorId));
      expect(visitor?.contactId).toBeNull();
      expect(visitor?.contactLinkedAt).toBeInstanceOf(Date);
      const anasChat = randomUUID();
      await tx.insert(conversations).values({ id: anasChat, businessId, widgetVisitorId: visitorId, channel: "web_chat", status: "closed", createdAt: new Date(Date.now() - 2 * 3_600_000) });
      await tx.insert(messages).values({ businessId, conversationId: anasChat, channel: "web_chat", direction: "inbound", body: "Ana's private question" });
      // Requests run in their own transactions, so the link predates the next chat.
      await tx.update(widgetVisitors).set({ contactLinkedAt: new Date(Date.now() - 3_600_000) }).where(eq(widgetVisitors.id, visitorId));

      const bensChat = await chat(visitorId, "Hi, Ben here");
      const ben = (await lead(visitorId, "ben@example.com"))!;
      expect(ben).not.toBe(ana);
      expect(await conversationContact(anasChat)).toBeNull();
      expect(await conversationContact(bensChat)).toBe(ben);
      const result = await detail(ben);
      expect(result.messages.map((message) => message.body)).toEqual(["Hi, Ben here"]);
      expect(result.activityCounts).toMatchObject({ messages: 1, conversations: 1 });
      expect(await listedMessageCount(ben)).toBe(1);
    });
  });

  it("stamps link times without assigning existing chats, and can run twice", async () => {
    await rollbackTest(async (tx) => {
      const [role] = (await tx.execute<{ bypass: boolean }>(sql`select rolsuper or rolbypassrls as bypass from pg_roles where rolname = current_user`)).rows;
      if (!role?.bypass) return; // The migration skips its backfill for roles under RLS.
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Backfill test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
      const [ana, other] = [randomUUID(), randomUUID()];
      await tx.insert(contacts).values([{ id: ana, businessId, email: "ana@example.com" }, { id: other, businessId, email: "other@example.com" }]);
      const [linked, deletedContact, anonymous] = [randomUUID(), randomUUID(), randomUUID()];
      await tx.insert(widgetVisitors).values([
        { id: linked, businessId, contactId: ana, email: "ana@example.com" },
        { id: deletedContact, businessId, email: "gone@example.com" },
        { id: anonymous, businessId },
      ]);
      const [unassigned, assigned, orphan, anonymousChat] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await tx.insert(conversations).values([
        { id: unassigned, businessId, widgetVisitorId: linked, channel: "web_chat" },
        { id: assigned, businessId, contactId: other, widgetVisitorId: linked, channel: "web_chat" },
        { id: orphan, businessId, widgetVisitorId: deletedContact, channel: "web_chat" },
        { id: anonymousChat, businessId, widgetVisitorId: anonymous, channel: "web_chat" },
      ]);
      const migration = await readFile(new URL("../../../db/migrations/0073_widget_chat_contacts.sql", import.meta.url), "utf8");
      await tx.execute(sql.raw(migration));
      await tx.execute(sql.raw(migration));

      const chats = new Map((await tx.select({ id: conversations.id, contactId: conversations.contactId }).from(conversations).where(eq(conversations.businessId, businessId))).map((row) => [row.id, row.contactId]));
      expect(Object.fromEntries([unassigned, assigned, orphan, anonymousChat].map((id) => [id, chats.get(id)]))).toEqual({ [unassigned]: null, [assigned]: other, [orphan]: null, [anonymousChat]: null });
      const visitors = new Map((await tx.select({ id: widgetVisitors.id, contactLinkedAt: widgetVisitors.contactLinkedAt }).from(widgetVisitors).where(eq(widgetVisitors.businessId, businessId))).map((row) => [row.id, row.contactLinkedAt]));
      expect(visitors.get(linked)).toBeInstanceOf(Date);
      expect(visitors.get(deletedContact)).toBeInstanceOf(Date);
      expect(visitors.get(anonymous)).toBeNull();
    });
  });
});
