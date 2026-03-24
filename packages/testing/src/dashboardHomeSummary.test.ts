import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const convexModules = import.meta.glob("../../../convex/**/*.ts");

async function seedBusinessMember(t: ReturnType<typeof convexTest>, subject: string) {
  const { businessId, userId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `dashboard-home-${subject}`,
      name: "Dashboard Home Business",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: subject,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });

    return { businessId, userId };
  });

  return { businessId, userId, authed: t.withIdentity({ subject }) };
}

async function insertContact(
  ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0],
  businessId: Id<"businesses">,
  input: {
    name: string;
    phone: string;
  },
) {
  return await ctx.db.insert("contacts", {
    businessId,
    phone: input.phone,
    name: input.name,
  });
}

describe("Dashboard home summary", () => {
  it("only shows deduped follow-up tasks in action required", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "dashboard-home-follow-up");

    const { callId, newestVoiceTaskId, handoffConversationId } = await t.run(async (ctx) => {
      const voiceContactId = await insertContact(ctx, businessId, {
        name: "Raphael Morency",
        phone: "+15817484609",
      });
      const voiceConversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId: voiceContactId,
        channel: "voice",
        status: "open",
      });
      const callId = await ctx.db.insert("calls", {
        businessId,
        conversationId: voiceConversationId,
        twilioCallSid: "CA-dashboard-home-follow-up",
        status: "completed",
        startedAt: "2026-03-19T12:00:00.000Z",
      });

      await ctx.db.insert("inbox_items", {
        businessId,
        kind: "voice_message",
        title: "Voice message from Raphael Morency",
        body: "Callback: +15817484609\n\nOlder callback note.",
        relatedId: String(callId),
        status: "open",
      });
      const newestVoiceTaskId = await ctx.db.insert("inbox_items", {
        businessId,
        kind: "voice_message",
        title: "Voice message from Raphael Morency",
        body: "Callback: +15817484609\nPreferred callback: Tomorrow morning\n\nNewest callback note.",
        relatedId: String(callId),
        status: "open",
      });
      await ctx.db.insert("inbox_items", {
        businessId,
        kind: "operator_alert",
        title: "Operator alert",
        body: "This should not appear on the home queue.",
        status: "open",
      });
      await ctx.db.insert("inbox_items", {
        businessId,
        kind: "calendar_sync_issue",
        title: "Calendar sync issue",
        body: "This should not appear on the home queue.",
        relatedId: "appointment-1",
        status: "open",
      });

      const smsContactId = await insertContact(ctx, businessId, {
        name: "Taylor Customer",
        phone: "+14165550199",
      });
      const handoffConversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId: smsContactId,
        channel: "sms",
        status: "open",
        automationState: "human_handoff",
      });
      await ctx.db.insert("messages", {
        businessId,
        conversationId: handoffConversationId,
        direction: "inbound",
        channel: "sms",
        body: "I still need a human to reply.",
        status: "received",
        aiGenerated: false,
      });

      return { callId, newestVoiceTaskId, handoffConversationId };
    });

    const summary = await authed.query(api.dashboard.overview.getHomeSummary, {
      businessId,
    });

    expect(summary.actionRequired).toHaveLength(2);
    expect(summary.actionRequired.some((item) => item.kind === "operator_alert")).toBe(false);
    expect(summary.actionRequired.some((item) => item.kind === "calendar_sync_issue")).toBe(false);

    const voiceTask = summary.actionRequired.find((item) => item.kind === "voice_message");
    expect(voiceTask).toMatchObject({
      taskId: newestVoiceTaskId,
      callId,
    });
    expect(voiceTask?.body).toContain("Newest callback note.");

    const handoffTask = summary.actionRequired.find((item) => item.kind === "human_handoff");
    expect(handoffTask).toMatchObject({
      conversationId: handoffConversationId,
    });
  });

  it("completes voice follow-up tasks and removes resumed handoffs from the home queue", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, userId, authed } = await seedBusinessMember(
      t,
      "dashboard-home-resolve-follow-up",
    );

    const { voiceTaskId, handoffConversationId } = await t.run(async (ctx) => {
      const voiceContactId = await insertContact(ctx, businessId, {
        name: "Raphael Morency",
        phone: "+15817484609",
      });
      const voiceConversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId: voiceContactId,
        channel: "voice",
        status: "open",
      });
      const callId = await ctx.db.insert("calls", {
        businessId,
        conversationId: voiceConversationId,
        twilioCallSid: "CA-dashboard-home-resolve-follow-up",
        status: "completed",
        startedAt: "2026-03-19T12:00:00.000Z",
      });
      const voiceTaskId = await ctx.db.insert("inbox_items", {
        businessId,
        kind: "voice_message",
        title: "Voice message from Raphael Morency",
        body: "Callback: +15817484609\n\nPlease call me back.",
        relatedId: String(callId),
        status: "open",
      });

      const smsContactId = await insertContact(ctx, businessId, {
        name: "Taylor Customer",
        phone: "+14165550199",
      });
      const handoffConversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId: smsContactId,
        channel: "sms",
        status: "open",
        automationState: "human_handoff",
      });
      await ctx.db.insert("messages", {
        businessId,
        conversationId: handoffConversationId,
        direction: "inbound",
        channel: "sms",
        body: "Can a human take this over?",
        status: "received",
        aiGenerated: false,
      });

      return { voiceTaskId, handoffConversationId };
    });

    const callsBefore = await authed.query(api.voice.runtime.listRecentCalls, {
      businessId,
      limit: 10,
    });
    expect(callsBefore[0]?.followUpTask).toMatchObject({
      id: voiceTaskId,
    });

    await authed.mutation(api.voice.runtime.completeVoiceFollowUpTask, {
      businessId,
      inboxItemId: voiceTaskId,
    });

    let summary = await authed.query(api.dashboard.overview.getHomeSummary, {
      businessId,
    });
    expect(
      summary.actionRequired.some(
        (item) => "taskId" in item && item.taskId === voiceTaskId,
      ),
    ).toBe(false);

    const callsAfter = await authed.query(api.voice.runtime.listRecentCalls, {
      businessId,
      limit: 10,
    });
    expect(callsAfter[0]?.followUpTask).toBeNull();

    await t.mutation(internal.dashboard.messages.setConversationAutomationState, {
      businessId,
      conversationId: handoffConversationId,
      automationState: "ai_active",
      actorUserId: userId,
    });

    summary = await authed.query(api.dashboard.overview.getHomeSummary, {
      businessId,
    });
    expect(
      summary.actionRequired.some(
        (item) => "conversationId" in item && item.conversationId === handoffConversationId,
      ),
    ).toBe(false);
  });
});
