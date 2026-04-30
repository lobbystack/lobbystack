import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const convexModules = modules;
type ConvexHarness = TestConvex<typeof schema>;

async function flushImmediateScheduledFunctions(t: ConvexHarness): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await t.finishInProgressScheduledFunctions();
}

async function seedUserAndBusiness(
  t: ConvexHarness,
  input: {
    subject: string;
    membershipStatus?: string;
  },
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: "operator@example.com",
      displayName: "Operator One",
    });
    const businessId = await ctx.db.insert("businesses", {
      slug: "maple-clinic",
      name: "Maple Clinic",
      timezone: "America/Toronto",
      businessType: "clinic",
      deploymentMode: "cloud",
      status: "active",
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "owner",
      status: input.membershipStatus ?? "active",
    });
    return { businessId, userId };
  });
}

describe("dashboard feedback", () => {
  it("lets an authenticated business member submit feedback", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "feedback-owner";
    const { businessId, userId } = await seedUserAndBusiness(t, { subject });

    const asOwner = t.withIdentity({ subject });
    const result = await asOwner.mutation(api.feedback.submit, {
      businessId,
      message: "  Please add a better empty state.  ",
      pagePath: "/contacts",
      userAgent: "Vitest",
    });

    const submission = await t.run(async (ctx) => {
      return await ctx.db.get(result.feedbackSubmissionId);
    });

    expect(submission).toMatchObject({
      userId,
      userEmail: "operator@example.com",
      userName: "Operator One",
      businessId,
      businessName: "Maple Clinic",
      message: "Please add a better empty state.",
      pagePath: "/contacts",
      userAgent: "Vitest",
      emailStatus: "pending_email",
    });

    await flushImmediateScheduledFunctions(t);
  });

  it("rejects unauthenticated feedback", async () => {
    const t = convexTest(schema, convexModules);

    await expect(
      t.mutation(api.feedback.submit, {
        message: "Please improve this.",
      }),
    ).rejects.toThrow("Authentication required.");
  });

  it("rejects feedback for a business the user cannot access", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "feedback-non-member";
    const { businessId } = await seedUserAndBusiness(t, {
      subject,
      membershipStatus: "removed",
    });

    await expect(
      t.withIdentity({ subject }).mutation(api.feedback.submit, {
        businessId,
        message: "Please improve this.",
      }),
    ).rejects.toThrow("You do not have access to this business.");
  });

  it("rejects empty and over-limit messages", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "feedback-validation";
    await seedUserAndBusiness(t, { subject });
    const asOwner = t.withIdentity({ subject });

    await expect(
      asOwner.mutation(api.feedback.submit, {
        message: "   ",
      }),
    ).rejects.toThrow("Feedback message is required.");

    await expect(
      asOwner.mutation(api.feedback.submit, {
        message: "x".repeat(2_001),
      }),
    ).rejects.toThrow("Feedback message must be 2000 characters or fewer.");
  });

  it("updates feedback email delivery status", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "feedback-email-status";
    const { businessId, userId } = await seedUserAndBusiness(t, { subject });
    const feedbackSubmissionId = await t.run(async (ctx) => {
      return await ctx.db.insert("feedback_submissions", {
        userId,
        businessId,
        message: "A useful idea",
        emailStatus: "pending_email",
        submittedAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-04-30T00:00:00.000Z",
      });
    });

    await t.mutation(internal.feedback.markFeedbackEmailSent, {
      feedbackSubmissionId,
      providerMessageId: "email_123",
    });

    await t.run(async (ctx) => {
      const submission = await ctx.db.get(feedbackSubmissionId);
      expect(submission).toMatchObject({
        emailStatus: "email_sent",
        providerMessageId: "email_123",
      });
      expect(submission?.emailedAt).toBeTruthy();
    });

    await t.mutation(internal.feedback.markFeedbackEmailFailed, {
      feedbackSubmissionId,
      error: "Resend failed",
    });

    await t.run(async (ctx) => {
      const submission = await ctx.db.get(feedbackSubmissionId);
      expect(submission).toMatchObject({
        emailStatus: "email_failed",
        emailError: "Resend failed",
      });
    });
  });
});
