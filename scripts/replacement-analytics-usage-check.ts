import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, conversations, createDatabaseClient, knowledgeChunks, knowledgeDocuments, messages, storageObjects, users, widgetVisitors, withBusinessTransaction } from "@lobbystack/db";
import { getAnalytics, getKnowledgeStorageUsageBytes } from "@lobbystack/domain";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const auth = createDatabaseClient("lobbystack_auth");
const worker = createDatabaseClient("lobbystack_worker");
const app = createDatabaseClient("lobbystack_app");
const userId = randomUUID();
const businessId = randomUUID();
const foreignBusinessId = randomUUID();
try {
  await auth.db.insert(users).values({ id: userId, email: `${userId}@analytics.invalid`, normalizedEmail: `${userId}@analytics.invalid` });
  for (const tenant of [businessId, foreignBusinessId]) {
    await withBusinessTransaction(worker.db, { businessId: tenant, actorType: "worker" }, async (tx) => {
      await tx.insert(businesses).values({ id: tenant, slug: `analytics-${tenant}`, name: "Analytics certification", timezone: "UTC", businessType: "service_company" });
      await tx.insert(businessMemberships).values({ businessId: tenant, userId, role: "business_owner", status: "active" });
      const conversationId = randomUUID();
      const visitorId = randomUUID();
      await tx.insert(widgetVisitors).values({ id: visitorId, businessId: tenant });
      await tx.insert(conversations).values({ id: conversationId, businessId: tenant, channel: "web_chat", widgetVisitorId: visitorId });
      await tx.insert(messages).values([
        { businessId: tenant, conversationId, channel: "web_chat", direction: "inbound", body: "Hello", createdAt: new Date("2026-09-01T23:59:58Z") },
        { businessId: tenant, conversationId, channel: "web_chat", direction: "outbound", aiGenerated: true, body: "Welcome", createdAt: new Date("2026-09-02T00:00:03Z") },
      ]);
      const storageId = randomUUID();
      const documentId = randomUUID();
      await tx.insert(storageObjects).values({ id: storageId, businessId: tenant, objectKey: `${tenant}/document`, purpose: "knowledge", fileName: "test.txt", contentType: "text/plain", contentLength: 100, status: "available" });
      await tx.insert(knowledgeDocuments).values({ id: documentId, businessId: tenant, sourceType: "upload", title: "Test", storageObjectId: storageId });
      await tx.insert(knowledgeChunks).values({ businessId: tenant, documentId, sequence: 0, content: "é", contentHash: "test" });
    });
  }
  const analytics = await getAnalytics({ db: app.db }, { userId, businessId, from: new Date("2026-09-02T00:00:00Z"), to: new Date("2026-09-03T00:00:00Z"), previousFrom: new Date("2026-09-01T00:00:00Z"), granularity: "day" });
  assert(analytics.agentResponseSeconds.current === 5, "Response time must include inbound messages preceding the selected range.");
  assert(analytics.series[0]?.agentResponseSeconds === 5, "Response time was not assigned to its reply bucket.");
  assert(analytics.messages.current === 1 && analytics.channels.other === 1, "Analytics leaked another tenant or misclassified website chat.");
  assert(analytics.outcomes.length === 4 && analytics.outcomes.every((row) => row.count === 0), "Empty outcomes must retain all four display states.");
  const additionalConversation = randomUUID();
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
    await tx.insert(conversations).values({ id: additionalConversation, businessId, channel: "web_chat" });
    await tx.insert(messages).values([
      { businessId, conversationId: additionalConversation, channel: "web_chat", direction: "inbound", body: "Seed", createdAt: new Date("2026-08-31T23:59:58Z") },
      { businessId, conversationId: additionalConversation, channel: "web_chat", direction: "outbound", aiGenerated: true, body: "Previous-period reply", createdAt: new Date("2026-09-01T00:00:03Z") },
      { businessId, conversationId: additionalConversation, channel: "web_chat", direction: "outbound", aiGenerated: true, body: "Repeated reply", createdAt: new Date("2026-09-01T00:00:09Z") },
      { businessId, conversationId: additionalConversation, channel: "web_chat", direction: "inbound", body: "First inbound", createdAt: new Date("2026-09-02T00:00:01Z") },
      { businessId, conversationId: additionalConversation, channel: "web_chat", direction: "inbound", body: "Latest inbound", createdAt: new Date("2026-09-02T00:00:02Z") },
      { businessId, conversationId: additionalConversation, channel: "web_chat", direction: "outbound", aiGenerated: false, body: "Human reply", createdAt: new Date("2026-09-02T00:00:03Z") },
      { businessId, conversationId: additionalConversation, channel: "web_chat", direction: "outbound", aiGenerated: true, body: "AI reply", createdAt: new Date("2026-09-02T00:00:09Z") },
      { businessId, conversationId: additionalConversation, channel: "web_chat", direction: "outbound", aiGenerated: true, body: "Repeated AI reply", createdAt: new Date("2026-09-02T00:00:10Z") },
    ]);
  });
  for (const granularity of ["hour", "day", "week", "month", "year"] as const) {
    const result = await getAnalytics({ db: app.db }, { userId, businessId, from: new Date("2026-09-02T00:00:00Z"), to: new Date("2026-09-03T00:00:00Z"), previousFrom: new Date("2026-09-01T00:00:00Z"), granularity });
    assert(result.agentResponseSeconds.previous === 5, "Must seed responses from before the previous period.");
    assert(result.agentResponseSeconds.current === 6, "Must pair latest inbound independently per conversation and ignore human/repeated AI replies.");
    assert(result.series.find(row => row.messages > 0)?.agentResponseSeconds === 6, `Incorrect ${granularity} response bucket.`);
  }
  await withBusinessTransaction(app.db, { businessId, userId, actorType: "operator" }, async (tx) => {
    assert(await getKnowledgeStorageUsageBytes(tx, businessId) === 102, "Storage usage must include uploaded bytes and UTF-8 extracted text.");
    assert(await getKnowledgeStorageUsageBytes(tx, foreignBusinessId) === 0, "Storage usage escaped the active tenant RLS context.");
  });
  console.log(JSON.stringify({ responseTime: true, crossPeriodPairing: true, responseBuckets: true, channelMapping: true, emptyOutcomes: true, storageBytes: true, tenantIsolation: true }));
} finally {
  for (const tenant of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: tenant, actorType: "worker" }, async (tx) => tx.delete(businesses).where(eq(businesses.id, tenant)));
  await auth.db.delete(users).where(eq(users.id, userId));
  await Promise.all([auth.pool.end(), worker.pool.end(), app.pool.end()]);
}
