import { eq } from "drizzle-orm";

import { businesses, enqueueOutbox, feedbackSubmissions, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_PAGE_PATH_LENGTH = 500;
const MAX_USER_AGENT_LENGTH = 1_000;

function optionalText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function safeSubjectText(value: string | null | undefined): string {
  return (value?.replace(/[\r\n]+/g, " ").trim() || "operator").slice(0, 160);
}

export async function requireFeedbackAccess(context: DomainContext, input: { userId: string; businessId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => await requireBusinessMembership(tx, input));
}

export async function submitFeedback(
  context: DomainContext,
  input: { userId: string; businessId?: string; message: string; pagePath?: string; userAgent?: string },
): Promise<string> {
  return await withBusinessTransaction(context.db, { userId: input.userId, ...(input.businessId ? { businessId: input.businessId } : {}), actorType: "operator" }, async (tx) => {
    const message = input.message.trim();
    if (!message) throw new Error("Feedback message is required.");
    if (message.length > MAX_MESSAGE_LENGTH) throw new Error(`Feedback message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
    const user = (await tx.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!user) throw new Error("User not found.");
    let businessName: string | undefined;
    if (input.businessId) {
      await requireBusinessMembership(tx, { userId: input.userId, businessId: input.businessId });
      businessName = (await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0]?.name;
    }
    const recipientEmail = process.env.FEEDBACK_TO_EMAIL?.trim() || undefined;
    const [submission] = await tx.insert(feedbackSubmissions).values({
      userId: input.userId,
      ...(user.email ? { userEmail: user.email } : {}),
      ...(user.name ? { userName: user.name } : {}),
      ...(input.businessId ? { businessId: input.businessId } : {}),
      ...(businessName ? { businessName } : {}),
      message,
      ...(optionalText(input.pagePath, MAX_PAGE_PATH_LENGTH) ? { pagePath: optionalText(input.pagePath, MAX_PAGE_PATH_LENGTH) } : {}),
      ...(optionalText(input.userAgent, MAX_USER_AGENT_LENGTH) ? { userAgent: optionalText(input.userAgent, MAX_USER_AGENT_LENGTH) } : {}),
      emailStatus: recipientEmail ? "pending_email" : "email_failed",
      ...(recipientEmail ? { recipientEmail } : {}),
      emailError: recipientEmail ? null : "FEEDBACK_TO_EMAIL is required to deliver dashboard feedback email.",
    }).returning({ id: feedbackSubmissions.id });
    if (!submission) throw new Error("Feedback submission could not be saved.");
    if (recipientEmail) {
      await enqueueOutbox(tx, {
        topic: "email.send",
        businessId: input.businessId,
        aggregateType: "feedback_submission",
        aggregateId: submission.id,
        dedupeKey: `feedback:${submission.id}:email`,
        payload: {
          template: "feedback_submission",
          feedbackSubmissionId: submission.id,
          to: recipientEmail,
          subject: `LobbyStack feedback from ${safeSubjectText(businessName ?? user.name ?? user.email)}`,
          variables: { body: message },
        },
      });
    }
    return submission.id;
  });
}

async function feedbackTransaction<T>(context: DomainContext, input: { feedbackSubmissionId: string; businessId?: string }, callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await withBusinessTransaction(context.db, { actorType: "worker", ...(input.businessId ? { businessId: input.businessId } : {}) }, callback);
}

export async function markFeedbackEmailSent(context: DomainContext, input: { feedbackSubmissionId: string; businessId?: string; providerMessageId: string }): Promise<boolean> {
  return await feedbackTransaction(context, input, async (tx) => (await tx.update(feedbackSubmissions).set({ emailStatus: "email_sent", providerMessageId: input.providerMessageId, emailError: null, emailedAt: new Date(), updatedAt: new Date() }).where(eq(feedbackSubmissions.id, input.feedbackSubmissionId)).returning({ id: feedbackSubmissions.id })).length > 0);
}

export async function markFeedbackEmailFailed(context: DomainContext, input: { feedbackSubmissionId: string; businessId?: string; error: string }): Promise<boolean> {
  return await feedbackTransaction(context, input, async (tx) => (await tx.update(feedbackSubmissions).set({ emailStatus: "email_failed", emailError: input.error.slice(0, 2_000), updatedAt: new Date() }).where(eq(feedbackSubmissions.id, input.feedbackSubmissionId)).returning({ id: feedbackSubmissions.id })).length > 0);
}
