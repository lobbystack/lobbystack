import { and, desc, eq, sql } from "drizzle-orm";

import { unansweredQuestions, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { contentExpiryForPlan, isContentRetentionEnabled, resolveBusinessBillingPlan } from "./contentRetentionPolicy";
import { createKnowledgeSnippetInTransaction } from "./knowledge";

/** The longest question kept, in characters. Longer lookups are cut, so an answered question fits as a text entry's title. */
export const MAX_UNANSWERED_QUESTION_LENGTH = 300;
/** The longest answer saved as a text entry, in characters. */
export const MAX_UNANSWERED_ANSWER_LENGTH = 5_000;
/** The most open questions the dashboard lists at once. */
const OPEN_QUESTIONS_LIMIT = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type UnansweredQuestionChannel = "voice" | "web_voice" | "web_chat" | "instagram";

export type OpenUnansweredQuestion = {
  id: string;
  question: string;
  timesAsked: number;
  firstAskedAt: Date;
  lastAskedAt: Date;
  lastChannel: string;
  lastCallId: string | null;
  lastConversationId: string | null;
};

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

function cleanQuestion(question: string): string {
  return question.replace(/\s+/gu, " ").trim().slice(0, MAX_UNANSWERED_QUESTION_LENGTH).trim();
}

/**
 * The form two questions are compared in: case, accents' composed forms,
 * punctuation and spacing don't count, so "Do you have parking?" and
 * "do you have  parking" are the same question.
 */
export function normalizeUnansweredQuestion(question: string): string {
  return question.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, MAX_UNANSWERED_QUESTION_LENGTH).trim();
}

/**
 * Saves a question the receptionist found no knowledge for. Asked again while
 * its row is open or dismissed, it counts there instead of adding a row, so a
 * dismissed question stays dismissed until it expires with other caller
 * content; asked after that, it opens a new row. The call and conversation it came from
 * are kept only while they belong to the business. Null when the question has
 * no words to save. Calls and chats record these as the worker.
 */
export async function recordUnansweredQuestion(
  context: DomainContext,
  input: { businessId: string; question: string; channel: UnansweredQuestionChannel; callId?: string | undefined; conversationId?: string | undefined; now?: Date },
): Promise<{ id: string; timesAsked: number; status: string } | null> {
  const question = cleanQuestion(input.question);
  const normalizedQuestion = normalizeUnansweredQuestion(question);
  if (!normalizedQuestion) return null;
  const now = input.now ?? new Date();
  const { businessId } = input;
  return await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => {
    // The question repeats what a caller said, so it expires like a follow-up made from their call.
    const retentionPlan = isContentRetentionEnabled() ? await resolveBusinessBillingPlan(tx, businessId) : null;
    const contentExpiresAt = retentionPlan ? contentExpiryForPlan(retentionPlan, "follow_ups", now) : null;
    const lastCallId = input.callId && UUID.test(input.callId) ? sql`(select c.id from public.calls c where c.id = ${input.callId}::uuid and c.business_id = ${businessId}::uuid)` : null;
    const lastConversationId = input.conversationId && UUID.test(input.conversationId) ? sql`(select c.id from public.conversations c where c.id = ${input.conversationId}::uuid and c.business_id = ${businessId}::uuid)` : null;
    const [row] = await tx.insert(unansweredQuestions).values({
      businessId,
      question,
      normalizedQuestion,
      lastChannel: input.channel,
      lastCallId,
      lastConversationId,
      firstAskedAt: now,
      lastAskedAt: now,
      contentExpiresAt,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [unansweredQuestions.businessId, unansweredQuestions.normalizedQuestion],
      targetWhere: sql`${unansweredQuestions.status} in ('open', 'dismissed')`,
      set: {
        timesAsked: sql`${unansweredQuestions.timesAsked} + 1`,
        lastAskedAt: now,
        lastChannel: sql`excluded.last_channel`,
        lastCallId: sql`excluded.last_call_id`,
        lastConversationId: sql`excluded.last_conversation_id`,
        contentExpiresAt: sql`excluded.content_expires_at`,
        updatedAt: now,
      },
    }).returning({ id: unansweredQuestions.id, timesAsked: unansweredQuestions.timesAsked, status: unansweredQuestions.status });
    return row ?? null;
  });
}

/** The business's open questions, most asked first, and how many are open. Anyone on the team reads them. */
export async function listOpenUnansweredQuestions(
  context: DomainContext,
  input: { userId: string; businessId: string },
): Promise<{ questions: OpenUnansweredQuestion[]; openCount: number }> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const open = and(eq(unansweredQuestions.businessId, input.businessId), eq(unansweredQuestions.status, "open"));
    const questions = await tx.select({
      id: unansweredQuestions.id,
      question: unansweredQuestions.question,
      timesAsked: unansweredQuestions.timesAsked,
      firstAskedAt: unansweredQuestions.firstAskedAt,
      lastAskedAt: unansweredQuestions.lastAskedAt,
      lastChannel: unansweredQuestions.lastChannel,
      lastCallId: unansweredQuestions.lastCallId,
      lastConversationId: unansweredQuestions.lastConversationId,
    }).from(unansweredQuestions).where(open)
      .orderBy(desc(unansweredQuestions.timesAsked), desc(unansweredQuestions.lastAskedAt), desc(unansweredQuestions.id))
      .limit(OPEN_QUESTIONS_LIMIT);
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(unansweredQuestions).where(open);
    return { questions, openCount: count?.value ?? 0 };
  });
}

async function lockOpenQuestion(tx: DatabaseTransaction, input: { businessId: string; questionId: string }) {
  if (!UUID.test(input.questionId)) throw failure("Question not found.", 404, "not_found");
  const [question] = await tx.select({ id: unansweredQuestions.id, question: unansweredQuestions.question, status: unansweredQuestions.status })
    .from(unansweredQuestions)
    .where(and(eq(unansweredQuestions.id, input.questionId), eq(unansweredQuestions.businessId, input.businessId)))
    .limit(1)
    .for("update");
  if (!question) throw failure("Question not found.", 404, "not_found");
  if (question.status !== "open") throw failure("This question was already answered or dismissed.", 409, "question_resolved");
  return question;
}

/**
 * Saves the answer as a text entry titled with the question, which refreshes
 * the receptionist's snapshot like any new entry, and marks the question
 * answered. Owners and admins answer.
 */
export async function answerUnansweredQuestion(
  context: DomainContext,
  input: { userId: string; businessId: string; questionId: string; answer: string },
): Promise<{ snippetId: string }> {
  const answer = input.answer.trim();
  if (!answer) throw failure("Write an answer first.", 400, "answer_required");
  if (answer.length > MAX_UNANSWERED_ANSWER_LENGTH) throw failure(`Answers can be up to ${MAX_UNANSWERED_ANSWER_LENGTH} characters.`, 400, "answer_too_long");
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const question = await lockOpenQuestion(tx, input);
    const snippet = await createKnowledgeSnippetInTransaction(tx, { businessId: input.businessId, title: question.question, content: answer });
    const now = new Date();
    await tx.update(unansweredQuestions)
      .set({ status: "answered", answeredAt: now, knowledgeSnippetId: snippet.id, resolvedByUserId: input.userId, updatedAt: now })
      .where(and(eq(unansweredQuestions.id, question.id), eq(unansweredQuestions.businessId, input.businessId)));
    return { snippetId: snippet.id };
  });
}

/** Takes an open question off the list. Asked again, it counts on its dismissed row and stays off until it expires with other caller content. Owners and admins dismiss. */
export async function dismissUnansweredQuestion(
  context: DomainContext,
  input: { userId: string; businessId: string; questionId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const question = await lockOpenQuestion(tx, input);
    const now = new Date();
    await tx.update(unansweredQuestions)
      .set({ status: "dismissed", dismissedAt: now, resolvedByUserId: input.userId, updatedAt: now })
      .where(and(eq(unansweredQuestions.id, question.id), eq(unansweredQuestions.businessId, input.businessId)));
  });
}
