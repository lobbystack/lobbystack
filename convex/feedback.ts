import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireCurrentUser, requireMembership } from "./lib/auth";
import { sendTransactionalEmail } from "./lib/providers/email";

const MAX_FEEDBACK_MESSAGE_LENGTH = 2_000;
const MAX_PAGE_PATH_LENGTH = 500;
const MAX_USER_AGENT_LENGTH = 1_000;

type FeedbackSubmissionForDelivery = Doc<"feedback_submissions">;

function normalizeFeedbackMessage(message: string): string {
  const normalized = message.trim();
  if (!normalized) {
    throw new Error("Feedback message is required.");
  }
  if (normalized.length > MAX_FEEDBACK_MESSAGE_LENGTH) {
    throw new Error(
      `Feedback message must be ${MAX_FEEDBACK_MESSAGE_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
    : normalized;
}

function getFeedbackRecipientEmail(): string | undefined {
  const email = process.env.FEEDBACK_TO_EMAIL?.trim();
  return email || undefined;
}

function displaySubmitter(submission: FeedbackSubmissionForDelivery): string {
  return (
    submission.userName ??
    submission.userEmail ??
    `User ${String(submission.userId)}`
  );
}

function buildFeedbackEmailSubject(submission: FeedbackSubmissionForDelivery): string {
  return `LobbyStack feedback from ${submission.businessName ?? displaySubmitter(submission)}`;
}

function formatFeedbackEmailField(label: string, value: string | undefined): string {
  return `${label}: ${value ?? "Not provided"}`;
}

function buildFeedbackEmailBody(submission: FeedbackSubmissionForDelivery): string {
  return [
    submission.message,
    [
      formatFeedbackEmailField("Submitter", displaySubmitter(submission)),
      formatFeedbackEmailField("Submitter email", submission.userEmail),
      formatFeedbackEmailField(
        "Business",
        submission.businessName
          ? `${submission.businessName} (${String(submission.businessId)})`
          : submission.businessId
            ? String(submission.businessId)
            : undefined,
      ),
      formatFeedbackEmailField("Page", submission.pagePath),
      formatFeedbackEmailField("Submitted at", submission.submittedAt),
      formatFeedbackEmailField("User agent", submission.userAgent),
    ].join("\n"),
  ].join("\n\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const submit = mutation({
  args: {
    businessId: v.optional(v.id("businesses")),
    message: v.string(),
    pagePath: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ feedbackSubmissionId: Id<"feedback_submissions"> }> => {
    const user = await requireCurrentUser(ctx);
    const message = normalizeFeedbackMessage(args.message);

    let business: Doc<"businesses"> | null = null;
    if (args.businessId) {
      const businessId = args.businessId;
      await requireMembership(ctx, businessId);
      business = await ctx.db.get(businessId);
      if (!business) {
        throw new Error("Business not found.");
      }
    }

    const now = new Date().toISOString();
    const pagePath = normalizeOptionalText(args.pagePath, MAX_PAGE_PATH_LENGTH);
    const userAgent = normalizeOptionalText(args.userAgent, MAX_USER_AGENT_LENGTH);
    const recipientEmail = getFeedbackRecipientEmail();
    const userName = user.displayName ?? user.name;
    const feedbackSubmissionId = await ctx.db.insert("feedback_submissions", {
      userId: user._id,
      ...(user.email ? { userEmail: user.email } : {}),
      ...(userName ? { userName } : {}),
      ...(business ? { businessId: business._id, businessName: business.name } : {}),
      message,
      ...(pagePath ? { pagePath } : {}),
      ...(userAgent ? { userAgent } : {}),
      emailStatus: "pending_email",
      ...(recipientEmail ? { recipientEmail } : {}),
      submittedAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.feedback.deliverFeedbackEmail, {
      feedbackSubmissionId,
    });

    return { feedbackSubmissionId };
  },
});

export const getFeedbackSubmissionForDelivery = internalQuery({
  args: {
    feedbackSubmissionId: v.id("feedback_submissions"),
  },
  handler: async (ctx, args): Promise<FeedbackSubmissionForDelivery | null> => {
    return await ctx.db.get(args.feedbackSubmissionId);
  },
});

export const markFeedbackEmailSent = internalMutation({
  args: {
    feedbackSubmissionId: v.id("feedback_submissions"),
    providerMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.feedbackSubmissionId, {
      emailStatus: "email_sent",
      providerMessageId: args.providerMessageId,
      emailedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const markFeedbackEmailFailed = internalMutation({
  args: {
    feedbackSubmissionId: v.id("feedback_submissions"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.feedbackSubmissionId, {
      emailStatus: "email_failed",
      emailError: args.error,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const deliverFeedbackEmail = internalAction({
  args: {
    feedbackSubmissionId: v.id("feedback_submissions"),
  },
  handler: async (ctx, args) => {
    const submission: FeedbackSubmissionForDelivery | null = await ctx.runQuery(
      internal.feedback.getFeedbackSubmissionForDelivery,
      {
        feedbackSubmissionId: args.feedbackSubmissionId,
      },
    );
    if (!submission || submission.emailStatus === "email_sent") {
      return null;
    }

    const recipientEmail = submission.recipientEmail ?? getFeedbackRecipientEmail();
    if (!recipientEmail) {
      await ctx.runMutation(internal.feedback.markFeedbackEmailFailed, {
        feedbackSubmissionId: args.feedbackSubmissionId,
        error: "FEEDBACK_TO_EMAIL is required to deliver dashboard feedback email.",
      });
      return null;
    }

    try {
      const result = await sendTransactionalEmail(ctx, {
        template: "feedback_submission",
        to: recipientEmail,
        subject: buildFeedbackEmailSubject(submission),
        variables: {
          body: buildFeedbackEmailBody(submission),
        },
      });

      await ctx.runMutation(internal.feedback.markFeedbackEmailSent, {
        feedbackSubmissionId: args.feedbackSubmissionId,
        providerMessageId: result.messageId,
      });
    } catch (error) {
      await ctx.runMutation(internal.feedback.markFeedbackEmailFailed, {
        feedbackSubmissionId: args.feedbackSubmissionId,
        error: errorMessage(error),
      });
    }

    return null;
  },
});
