import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businessContextSnapshots, conversations, createDatabaseClient, knowledgeSnippets, outboxMessages, unansweredQuestions, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { MAX_KNOWLEDGE_SNIPPETS_PER_SNAPSHOT } from "../snapshot";
import { refreshBusinessSnapshot } from "./knowledge";
import { runPrivacyRetentionSweep } from "./privacy";
import { createBusiness } from "./tenancy";
import { answerUnansweredQuestion, dismissUnansweredQuestion, listOpenUnansweredQuestions, recordUnansweredQuestion } from "./unansweredQuestions";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Unanswered question integration tests require a dedicated local test database.");
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

async function seedBusiness(tx: DatabaseTransaction) {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Owner" });
  await as(tx, "lobbystack_app");
  const context = { db: tx as unknown as Database };
  const { businessId } = await createBusiness(context, { userId, name: "Questions Dental", timezone: "UTC", businessType: "dental" });
  await as(tx, null);
  const conversationId = randomUUID();
  await tx.insert(conversations).values({ id: conversationId, businessId, channel: "web_chat" });
  return { context, userId, businessId, conversationId };
}

describe.skipIf(!testUrl)("unanswered questions against PostgreSQL under RLS", () => {
  it("counts the same question once, lists the most asked first, and answers it as a text entry", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId, conversationId } = await seedBusiness(tx);

      await as(tx, "lobbystack_worker");
      const first = await recordUnansweredQuestion(context, { businessId, question: "Do you validate parking?", channel: "voice", callId: randomUUID() });
      const again = await recordUnansweredQuestion(context, { businessId, question: "  do you VALIDATE   parking ", channel: "web_chat", conversationId });
      const other = await recordUnansweredQuestion(context, { businessId, question: "Can I bring my dog?", channel: "web_chat" });
      expect(first?.id).toBeDefined();
      expect(again).toEqual({ id: first!.id, timesAsked: 2, status: "open" });
      expect(other?.id).not.toBe(first!.id);
      // Nothing worth saving.
      expect(await recordUnansweredQuestion(context, { businessId, question: " ?! ", channel: "web_chat" })).toBeNull();

      await as(tx, "lobbystack_app");
      const listed = await listOpenUnansweredQuestions(context, { userId, businessId });
      expect(listed.openCount).toBe(2);
      expect(listed.questions.map((question) => [question.question, question.timesAsked])).toEqual([["Do you validate parking?", 2], ["Can I bring my dog?", 1]]);
      // The latest ask's references, and a call the business doesn't have isn't kept.
      expect(listed.questions[0]).toMatchObject({ lastChannel: "web_chat", lastConversationId: conversationId, lastCallId: null });

      const { snippetId } = await answerUnansweredQuestion(context, { userId, businessId, questionId: first!.id, answer: " Yes, we validate two hours at the front desk. " });
      await expect(answerUnansweredQuestion(context, { userId, businessId, questionId: first!.id, answer: "Again" })).rejects.toMatchObject({ status: 409 });
      await expect(answerUnansweredQuestion(context, { userId, businessId, questionId: other!.id, answer: "   " })).rejects.toMatchObject({ status: 400 });

      await as(tx, null);
      const [snippet] = await tx.select().from(knowledgeSnippets).where(eq(knowledgeSnippets.id, snippetId));
      expect(snippet).toMatchObject({ businessId, title: "Do you validate parking?", content: "Yes, we validate two hours at the front desk.", active: true });
      const [answered] = await tx.select().from(unansweredQuestions).where(eq(unansweredQuestions.id, first!.id));
      expect(answered).toMatchObject({ status: "answered", knowledgeSnippetId: snippetId, resolvedByUserId: userId });
      expect(answered?.answeredAt).toBeInstanceOf(Date);
      // The receptionist's snapshot picks the new entry up like any other.
      const refreshes = await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, "snapshot.refresh"), eq(outboxMessages.aggregateId, snippetId)));
      expect(refreshes).toHaveLength(1);
    });
  });

  it("puts an answer in the snapshot when the business already has a full snapshot of entries", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId } = await seedBusiness(tx);
      // Older entries at the same default priority as an answer, enough to fill the snapshot.
      const lastWeek = new Date(Date.now() - 7 * 86_400_000);
      await tx.insert(knowledgeSnippets).values(Array.from({ length: MAX_KNOWLEDGE_SNIPPETS_PER_SNAPSHOT }, (_, index) => ({ businessId, title: `Entry ${index}`, content: "Older text.", createdAt: lastWeek, updatedAt: lastWeek })));

      await as(tx, "lobbystack_worker");
      const question = await recordUnansweredQuestion(context, { businessId, question: "Do you have parking?", channel: "voice" });
      await as(tx, "lobbystack_app");
      const { snippetId } = await answerUnansweredQuestion(context, { userId, businessId, questionId: question!.id, answer: "Yes, behind the building." });
      await as(tx, "lobbystack_worker");
      await refreshBusinessSnapshot(context, { businessId });

      await as(tx, null);
      const [row] = await tx.select({ snapshot: businessContextSnapshots.snapshot }).from(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, businessId));
      const snippets = (row?.snapshot as { knowledgeSnippets: Array<{ id: string }> }).knowledgeSnippets;
      expect(snippets).toHaveLength(MAX_KNOWLEDGE_SNIPPETS_PER_SNAPSHOT);
      expect(snippets.map((snippet) => snippet.id)).toContain(snippetId);
    });
  });

  it("keeps a dismissed question off the list when it's asked again, and reopens an answered one", async () => {
    await rollbackTest(async (tx) => {
      const { context, userId, businessId } = await seedBusiness(tx);
      await as(tx, "lobbystack_worker");
      const dog = await recordUnansweredQuestion(context, { businessId, question: "Can I bring my dog?", channel: "web_chat" });
      const parking = await recordUnansweredQuestion(context, { businessId, question: "Do you validate parking?", channel: "voice" });

      await as(tx, "lobbystack_app");
      await dismissUnansweredQuestion(context, { userId, businessId, questionId: dog!.id });
      await expect(dismissUnansweredQuestion(context, { userId, businessId, questionId: dog!.id })).rejects.toMatchObject({ status: 409 });
      await answerUnansweredQuestion(context, { userId, businessId, questionId: parking!.id, answer: "Two hours free." });
      expect(await listOpenUnansweredQuestions(context, { userId, businessId })).toEqual({ questions: [], openCount: 0 });

      await as(tx, "lobbystack_worker");
      expect(await recordUnansweredQuestion(context, { businessId, question: "can i bring my dog", channel: "voice" })).toEqual({ id: dog!.id, timesAsked: 2, status: "dismissed" });
      const reopened = await recordUnansweredQuestion(context, { businessId, question: "Do you validate parking?", channel: "voice" });
      expect(reopened).toMatchObject({ timesAsked: 1, status: "open" });
      expect(reopened!.id).not.toBe(parking!.id);
    });
  });

  it("is the business's team's alone, and its owners' and admins' to resolve", async () => {
    await rollbackTest(async (tx) => {
      const { context, businessId } = await seedBusiness(tx);
      const outsider = randomUUID();
      await tx.insert(users).values({ id: outsider, email: `${outsider}@example.invalid`, normalizedEmail: `${outsider}@example.invalid`, name: "Outsider" });
      await as(tx, "lobbystack_worker");
      const question = await recordUnansweredQuestion(context, { businessId, question: "Do you validate parking?", channel: "voice" });

      await as(tx, "lobbystack_app");
      await expect(listOpenUnansweredQuestions(context, { userId: outsider, businessId })).rejects.toThrow();
      await expect(dismissUnansweredQuestion(context, { userId: outsider, businessId, questionId: question!.id })).rejects.toThrow();
      // Row-level security shows someone outside the team nothing.
      const leaked = await withBusinessTransaction(context.db, { userId: outsider, businessId, actorType: "operator" }, async (inner) => await inner.select({ id: unansweredQuestions.id }).from(unansweredQuestions));
      expect(leaked).toEqual([]);
    });
  });

  it("deletes questions once their content expires", async () => {
    await rollbackTest(async (tx) => {
      const { context, businessId } = await seedBusiness(tx);
      await as(tx, "lobbystack_worker");
      await recordUnansweredQuestion(context, { businessId, question: "Do you validate parking?", channel: "voice" });
      expect(await runPrivacyRetentionSweep(context, { businessId })).toMatchObject({ deletedUnansweredQuestions: 0 });
      // A free plan keeps follow-ups for 30 days.
      expect(await runPrivacyRetentionSweep(context, { businessId, now: new Date(Date.now() + 31 * 86_400_000) })).toMatchObject({ deletedUnansweredQuestions: 1 });
    });
  });
});
