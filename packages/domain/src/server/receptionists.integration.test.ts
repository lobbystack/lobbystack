import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agents, businessContextSnapshots, calls, conversations, createDatabaseClient, knowledgeDocuments, knowledgeSnippets, messages, phoneNumbers, receptionistProfiles, services, users, widgetKeys, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { snapshotForReceptionist, type BusinessContextSnapshot } from "@lobbystack/shared";

import { refreshBusinessSnapshot } from "./knowledge";
import {
  createReceptionist,
  deleteReceptionist,
  getSharedItemUsage,
  listReceptionistRoutes,
  listReceptionists,
  receptionistsUsingItem,
  routePhoneNumber,
  routeWidgetKey,
  setReceptionistKnowledgeItem,
  setReceptionistService,
  setStaffEnabled,
  updateReceptionist,
} from "./receptionists";
import { createAgentRule, listAgentRules } from "./rules";
import { receiveInboundSms } from "./sms";
import { createBusiness } from "./tenancy";
import { startCall } from "./voice";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Receptionist integration tests require a dedicated local test database.");
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

async function as(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker" | "migrator") {
  await tx.execute(role === "migrator" ? sql`reset role` : sql.raw(`set local role ${role}`));
}

async function seedOwner(tx: DatabaseTransaction, name: string) {
  const userId = randomUUID();
  const email = `${userId}@example.invalid`;
  await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Owner" });
  await as(tx, "lobbystack_app");
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name, timezone: "America/Toronto", businessType: "clinic" });
  await as(tx, "migrator");
  return { userId, businessId, context: { db: tx as unknown as Database } };
}

describe.skipIf(!client)("receptionists against PostgreSQL under RLS", () => {
  it("starts every business with one default receptionist mirrored into its profile", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, context } = await seedOwner(tx, "Maple Clinic");
      await as(tx, "lobbystack_app");
      const list = await listReceptionists(context, { userId, businessId });
      await as(tx, "migrator");
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: "Receptionist", isDefault: true, phoneNumberCount: 0 });
      const [profile] = await tx.select({ greeting: receptionistProfiles.greeting }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId));
      expect(profile?.greeting).toBe("Thanks for calling Maple Clinic.");
    });
  });

  it("creates, edits, routes and deletes receptionists without leaving a number orphaned", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, context } = await seedOwner(tx, "Maple Clinic");
      const [number] = await tx.insert(phoneNumbers).values({ businessId, e164: `+1555${String(Date.now()).slice(-7)}` }).returning({ id: phoneNumbers.id, e164: phoneNumbers.e164, agentId: phoneNumbers.agentId });
      const [key] = await tx.insert(widgetKeys).values({ businessId, keyHash: `hash-${randomUUID()}` }).returning({ id: widgetKeys.id, agentId: widgetKeys.agentId });
      const defaultId = number!.agentId;
      expect(key!.agentId).toBe(defaultId);

      await as(tx, "lobbystack_app");
      const evening = await createReceptionist(context, { userId, businessId, name: "  After   hours " });
      expect(evening).toMatchObject({ name: "After hours", isDefault: false, greeting: "Thanks for calling Maple Clinic." });
      await updateReceptionist(context, { userId, businessId, agentId: evening.id, patch: { greeting: "We're closed, but I can help.", bookingMode: "request", language: "fr", voice: "cedar" } });
      await routePhoneNumber(context, { userId, businessId, phoneNumberId: number!.id, agentId: evening.id });
      await routeWidgetKey(context, { userId, businessId, widgetKeyId: key!.id, agentId: evening.id });
      const routes = await listReceptionistRoutes(context, { userId, businessId });
      expect(routes.map((route) => [route.kind, route.agentId])).toEqual([["phone_number", evening.id], ["widget_key", evening.id]]);
      const summaries = await listReceptionists(context, { userId, businessId });
      expect(summaries.map((row) => [row.name, row.phoneNumberCount, row.widgetKeyCount])).toEqual([["Receptionist", 0, 0], ["After hours", 1, 1]]);
      await as(tx, "migrator");

      // Editing a second receptionist leaves the rollback profile alone.
      const [profile] = await tx.select({ greeting: receptionistProfiles.greeting }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId));
      expect(profile?.greeting).toBe("Thanks for calling Maple Clinic.");
      const route = (await tx.execute<{ business_id: string; agent_id: string }>(sql`select business_id, agent_id from app.resolve_phone_route(${number!.e164})`)).rows[0];
      expect(route).toEqual({ business_id: businessId, agent_id: evening.id });

      await as(tx, "lobbystack_app");
      await expect(deleteReceptionist(context, { userId, businessId, agentId: evening.id, reassignToAgentId: evening.id })).rejects.toMatchObject({ code: "receptionist_reassign_invalid" });
      // Deleting the default one hands the default role and nothing else over.
      await deleteReceptionist(context, { userId, businessId, agentId: defaultId, reassignToAgentId: evening.id });
      const afterFirstDelete = await listReceptionists(context, { userId, businessId });
      expect(afterFirstDelete.map((row) => [row.name, row.isDefault])).toEqual([["After hours", true]]);
      // The last receptionist can't be deleted.
      await expect(deleteReceptionist(context, { userId, businessId, agentId: evening.id, reassignToAgentId: defaultId })).rejects.toMatchObject({ status: 404 });
      await as(tx, "migrator");

      const [mirrored] = await tx.select({ greeting: receptionistProfiles.greeting, bookingMode: receptionistProfiles.bookingMode }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId));
      expect(mirrored).toEqual({ greeting: "We're closed, but I can help.", bookingMode: "request" });
      const [archived] = await tx.select({ archivedAt: agents.archivedAt }).from(agents).where(eq(agents.id, defaultId));
      expect(archived?.archivedAt).toBeInstanceOf(Date);
    });
  });

  it("refuses to delete the only receptionist", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, context } = await seedOwner(tx, "Solo Salon");
      await as(tx, "lobbystack_app");
      const [only] = await listReceptionists(context, { userId, businessId });
      const extra = await createReceptionist(context, { userId, businessId, name: "Temp" });
      await deleteReceptionist(context, { userId, businessId, agentId: extra.id, reassignToAgentId: only!.id });
      const second = await createReceptionist(context, { userId, businessId, name: "Temp 2" });
      await expect(tx.execute(sql`update agents set archived_at = now() where business_id = ${businessId}`)).rejects.toThrow();
      expect(second.isDefault).toBe(false);
    });
  });

  it("builds a snapshot per receptionist and applies knowledge and service opt-outs", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, context } = await seedOwner(tx, "Maple Clinic");
      const [cleaning] = await tx.insert(services).values({ businessId, name: "Cleaning", slug: "cleaning", durationMinutes: 30 }).returning({ id: services.id });
      const [surgery] = await tx.insert(services).values({ businessId, name: "Surgery", slug: "surgery", durationMinutes: 90 }).returning({ id: services.id });
      const [document] = await tx.insert(knowledgeDocuments).values({ businessId, sourceType: "text", title: "Surgery prices", status: "indexed" }).returning({ id: knowledgeDocuments.id });

      await as(tx, "lobbystack_app");
      const night = await createReceptionist(context, { userId, businessId, name: "Night line" });
      await setReceptionistService(context, { userId, businessId, agentId: night.id, serviceId: surgery!.id, enabled: false });
      await setReceptionistKnowledgeItem(context, { userId, businessId, agentId: night.id, documentId: document!.id, enabled: false });
      const usage = await getSharedItemUsage(context, { userId, businessId });
      expect(receptionistsUsingItem(usage, usage.serviceOptOuts.filter((row) => row.serviceId === surgery!.id).map((row) => row.agentId))).toEqual({ all: false, names: ["Receptionist"] });
      expect(receptionistsUsingItem(usage, [])).toEqual({ all: true, names: ["Receptionist", "Night line"] });
      await as(tx, "lobbystack_worker");
      await refreshBusinessSnapshot(context, { businessId });
      await as(tx, "migrator");

      const [row] = await tx.select({ snapshot: businessContextSnapshots.snapshot }).from(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, businessId)).orderBy(sql`${businessContextSnapshots.generatedAt} desc`).limit(1);
      const snapshot = row!.snapshot as unknown as BusinessContextSnapshot;
      const projected = snapshotForReceptionist(snapshot, night.id);
      expect(projected.agentName).toBe("Night line");
      expect(projected.services.map((service) => service.id)).toEqual([cleaning!.id]);
      expect(projected.excludedKnowledgeDocumentIds).toEqual([document!.id]);
      expect(projected.knowledgeDigest).not.toContain("Surgery prices");
      const everyone = snapshotForReceptionist(snapshot);
      expect(everyone.services).toHaveLength(2);
      expect(everyone.knowledgeDigest).toContain("Surgery prices");

      // Turning it back on removes the opt-out row.
      await as(tx, "lobbystack_app");
      await setReceptionistService(context, { userId, businessId, agentId: night.id, serviceId: surgery!.id, enabled: true });
      expect((await getSharedItemUsage(context, { userId, businessId })).serviceOptOuts).toEqual([]);
      await as(tx, "migrator");
    });
  });

  it("records the answering receptionist on calls and texts", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, context } = await seedOwner(tx, "Maple Clinic");
      const e164 = `+1555${String(Date.now() + 1).slice(-7)}`;
      const [number] = await tx.insert(phoneNumbers).values({ businessId, e164 }).returning({ id: phoneNumbers.id });
      await as(tx, "lobbystack_app");
      const sales = await createReceptionist(context, { userId, businessId, name: "Sales" });
      await routePhoneNumber(context, { userId, businessId, phoneNumberId: number!.id, agentId: sales.id });
      await as(tx, "lobbystack_worker");
      const call = await startCall(context, { businessId, provider: "openai_live", providerCallId: `rtc_${randomUUID()}`, from: "+15145550100", to: e164, transport: "voice", agentId: sales.id, billable: false });
      const unrouted = await startCall(context, { businessId, provider: "openai_live", providerCallId: `rtc_${randomUUID()}`, from: "+15145550101", to: e164, transport: "voice", billable: false });
      await receiveInboundSms(context, { businessId, providerMessageId: `SM${randomUUID().replaceAll("-", "")}`, from: "+15145550102", to: e164, body: "Hi", payload: {} });
      await as(tx, "migrator");

      const [callRow] = await tx.select({ agentId: calls.agentId }).from(calls).where(eq(calls.id, call.callId));
      const [conversationRow] = await tx.select({ agentId: conversations.agentId }).from(conversations).where(eq(conversations.id, call.conversationId));
      const [defaultRow] = await tx.select({ agentId: calls.agentId }).from(calls).where(eq(calls.id, unrouted.callId));
      const [textRow] = await tx.select({ agentId: conversations.agentId }).from(conversations).where(and(eq(conversations.businessId, businessId), eq(conversations.channel, "sms")));
      const [defaultAgent] = await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, businessId), eq(agents.isDefault, true)));
      expect(callRow?.agentId).toBe(sales.id);
      expect(conversationRow?.agentId).toBe(sales.id);
      expect(defaultRow?.agentId).toBe(defaultAgent!.id);
      expect(textRow?.agentId).toBe(sales.id);
    });
  });

  it("keeps a separate text thread per receptionist for the same contact", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, context } = await seedOwner(tx, "Two Line Clinic");
      const suffix = String(Date.now()).slice(-6);
      const [dayNumber] = await tx.insert(phoneNumbers).values({ businessId, e164: `+1555${suffix}1` }).returning({ id: phoneNumbers.id, e164: phoneNumbers.e164, agentId: phoneNumbers.agentId });
      const [nightNumber] = await tx.insert(phoneNumbers).values({ businessId, e164: `+1555${suffix}2` }).returning({ id: phoneNumbers.id, e164: phoneNumbers.e164 });
      await as(tx, "lobbystack_app");
      const night = await createReceptionist(context, { userId, businessId, name: "Night" });
      await routePhoneNumber(context, { userId, businessId, phoneNumberId: nightNumber!.id, agentId: night.id });
      await as(tx, "lobbystack_worker");
      const text = (to: string, body: string) => receiveInboundSms(context, { businessId, providerMessageId: `SM${randomUUID().replaceAll("-", "")}`, from: "+15145550177", to, body, payload: {} });
      await text(dayNumber!.e164, "Hi day line");
      await text(nightNumber!.e164, "Hi night line");
      await text(nightNumber!.e164, "Still there?");
      await as(tx, "migrator");
      const threads = await tx.select({ agentId: conversations.agentId, total: count(messages.id) }).from(conversations).innerJoin(messages, eq(messages.conversationId, conversations.id)).where(and(eq(conversations.businessId, businessId), eq(conversations.channel, "sms"))).groupBy(conversations.id, conversations.agentId);
      expect(threads.map((thread) => [thread.agentId, Number(thread.total)]).sort()).toEqual([[dayNumber!.agentId, 1], [night.id, 2]].sort());
    });
  });

  it("copies rules and opt-outs when a receptionist starts from another", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, context } = await seedOwner(tx, "Copy Clinic");
      const [service] = await tx.insert(services).values({ businessId, name: "Surgery", slug: "surgery", durationMinutes: 60 }).returning({ id: services.id });
      const [snippet] = await tx.insert(knowledgeSnippets).values({ businessId, title: "Prices", content: "Ask us." }).returning({ id: knowledgeSnippets.id });
      await as(tx, "lobbystack_app");
      const source = await createReceptionist(context, { userId, businessId, name: "Source" });
      await createAgentRule(context, { userId, businessId, agentId: source.id, title: "Night rule", content: "Say we open at 8." });
      await setReceptionistService(context, { userId, businessId, agentId: source.id, serviceId: service!.id, enabled: false });
      await setReceptionistKnowledgeItem(context, { userId, businessId, agentId: source.id, snippetId: snippet!.id, enabled: false });
      const copy = await createReceptionist(context, { userId, businessId, name: "Copy", copyFromAgentId: source.id });
      const rules = await listAgentRules(context, { userId, businessId, agentId: copy.id });
      const usage = await getSharedItemUsage(context, { userId, businessId });
      await as(tx, "migrator");
      expect(rules.map((rule) => rule.title)).toEqual(["Night rule"]);
      expect(usage.serviceOptOuts.filter((row) => row.agentId === copy.id)).toEqual([{ agentId: copy.id, serviceId: service!.id }]);
      expect(usage.knowledgeOptOuts.filter((row) => row.agentId === copy.id)).toEqual([{ agentId: copy.id, documentId: null, snippetId: snippet!.id }]);
    });
  });

  it("refuses opt-outs that point at another business's items", async () => {
    await rollbackTest(async (tx) => {
      const first = await seedOwner(tx, "First Clinic");
      const second = await seedOwner(tx, "Second Clinic");
      const [foreignService] = await tx.insert(services).values({ businessId: second.businessId, name: "Theirs", slug: "theirs", durationMinutes: 30 }).returning({ id: services.id });
      const [foreignSnippet] = await tx.insert(knowledgeSnippets).values({ businessId: second.businessId, title: "Theirs", content: "Private." }).returning({ id: knowledgeSnippets.id });
      const [firstAgent] = await tx.select({ id: agents.id }).from(agents).where(eq(agents.businessId, first.businessId));
      await as(tx, "lobbystack_app");
      await tx.execute(sql`select set_config('app.business_id', ${first.businessId}, true), set_config('app.user_id', ${first.userId}, true), set_config('app.actor_type', 'operator', true)`);
      await tx.execute(sql`savepoint foreign_service`);
      await expect(tx.execute(sql`insert into agent_service_opt_outs (business_id, agent_id, service_id) values (${first.businessId}, ${firstAgent!.id}, ${foreignService!.id})`)).rejects.toMatchObject({ cause: expect.objectContaining({ constraint: "agent_service_opt_outs_service_fk" }) });
      await tx.execute(sql`rollback to savepoint foreign_service`);
      await tx.execute(sql`savepoint foreign_snippet`);
      await expect(tx.execute(sql`insert into agent_knowledge_opt_outs (business_id, agent_id, knowledge_snippet_id) values (${first.businessId}, ${firstAgent!.id}, ${foreignSnippet!.id})`)).rejects.toMatchObject({ cause: expect.objectContaining({ constraint: "agent_knowledge_opt_outs_snippet_fk" }) });
      await tx.execute(sql`rollback to savepoint foreign_snippet`);
      // The domain function checks the item belongs to the business before writing.
      await expect(setReceptionistService(first.context, { userId: first.userId, businessId: first.businessId, agentId: firstAgent!.id, serviceId: foreignService!.id, enabled: false })).rejects.toMatchObject({ status: 404 });
      await as(tx, "migrator");
    });
  });

  it("keeps each business's receptionists private", async () => {
    await rollbackTest(async (tx) => {
      const first = await seedOwner(tx, "First Clinic");
      const second = await seedOwner(tx, "Second Clinic");
      await as(tx, "lobbystack_app");
      await expect(listReceptionists(first.context, { userId: first.userId, businessId: second.businessId })).rejects.toMatchObject({ status: 403 });
      const [secondsReceptionist] = await listReceptionists(second.context, { userId: second.userId, businessId: second.businessId });
      await expect(updateReceptionist(first.context, { userId: first.userId, businessId: first.businessId, agentId: secondsReceptionist!.id, patch: { greeting: "Hijacked" } })).rejects.toMatchObject({ status: 404 });
      await expect(setStaffEnabled(first.context, { userId: first.userId, businessId: second.businessId, enabled: true })).rejects.toMatchObject({ status: 403 });
      await as(tx, "migrator");
      const [untouched] = await tx.select({ greeting: agents.greeting }).from(agents).where(eq(agents.id, secondsReceptionist!.id));
      expect(untouched?.greeting).toBe("Thanks for calling Second Clinic.");
    });
  });
});
