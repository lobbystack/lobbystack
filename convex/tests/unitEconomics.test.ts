import { convexTest, type TestConvex } from "convex-test";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

type ConvexHarness = TestConvex<typeof schema>;
type TestRunCtx = Parameters<Parameters<ConvexHarness["run"]>[0]>[0];

const convexModules = modules;
const originalMonthlyConvexCost = process.env.UNIT_ECONOMICS_MONTHLY_CONVEX_COST_USD;
const originalMonthlyFlyCost = process.env.UNIT_ECONOMICS_MONTHLY_FLY_COST_USD;

async function seedBusinessMember(t: ConvexHarness, subject: string) {
  const { businessId, userId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `unit-economics-${subject}`,
      name: "Unit Economics Test Business",
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

async function seedConversation(ctx: TestRunCtx, businessId: Id<"businesses">) {
  const contactId = await ctx.db.insert("contacts", {
    businessId,
    phone: "+14165550123",
    name: "Jordan Customer",
  });
  const conversationId = await ctx.db.insert("conversations", {
    businessId,
    contactId,
    channel: "sms",
    status: "open",
  });

  return { contactId, conversationId };
}

describe("unit economics", () => {
  beforeEach(() => {
    delete process.env.UNIT_ECONOMICS_MONTHLY_CONVEX_COST_USD;
    delete process.env.UNIT_ECONOMICS_MONTHLY_FLY_COST_USD;
  });

  afterAll(() => {
    process.env.UNIT_ECONOMICS_MONTHLY_CONVEX_COST_USD = originalMonthlyConvexCost;
    process.env.UNIT_ECONOMICS_MONTHLY_FLY_COST_USD = originalMonthlyFlyCost;
  });

  it("backfills provider-priced calls, texts, and alerts into the monthly rollup", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "unit-economics-provider");

    const { callId, conversationId } = await t.run(async (ctx) => {
      const { conversationId } = await seedConversation(ctx, businessId);
      const nowIso = new Date().toISOString();
      const callId = await ctx.db.insert("calls", {
        businessId,
        conversationId,
        twilioCallSid: "CA-unit-economics-provider",
        status: "completed",
        providerCallStatus: "completed",
        providerCallDurationSeconds: 180,
        providerCostUsd: 0.04,
        providerUpdatedAt: nowIso,
        startedAt: nowIso,
        endedAt: nowIso,
      });
      await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        body: "Your appointment is confirmed.",
        status: "sent",
        senderRole: "business_ai",
        aiGenerated: true,
        providerCostUsd: 0.02,
        providerNumSegments: 2,
        providerUpdatedAt: nowIso,
      });
      await ctx.db.insert("notifications", {
        businessId,
        channel: "sms",
        kind: "appointment_reminder",
        relatedId: "appt-1",
        scheduledFor: nowIso,
        status: "sent",
        senderRole: "platform_alert",
        providerCostUsd: 0.01,
        providerNumSegments: 1,
        providerUpdatedAt: nowIso,
      });

      return { callId, conversationId };
    });

    await authed.mutation(api.unitEconomics.refreshMonth, { businessId });
    const summary = await authed.query(api.unitEconomics.getSummary, { businessId });

    expect(summary.rollup).not.toBeNull();
    expect(summary.rollup?.providerCostUsd).toBe(0.07);
    expect(summary.rollup?.aiCostUsd).toBe(0);
    expect(summary.rollup?.totalCostUsd).toBe(0.07);
    expect(summary.rollup?.voiceCallCount).toBe(1);
    expect(summary.rollup?.voiceMinutes).toBe(3);
    expect(summary.rollup?.outboundSmsCount).toBe(1);
    expect(summary.rollup?.smsThreadCount).toBe(1);
    expect(summary.rollup?.priceFloorInputs.voiceCallUsd).toBe(0.07);
    expect(summary.topVoiceCalls).toEqual([
      expect.objectContaining({
        callId,
        costUsd: 0.04,
      }),
    ]);
    expect(summary.topSmsThreads).toEqual([
      expect.objectContaining({
        conversationId,
        outboundTextCount: 1,
        costUsd: 0.02,
      }),
    ]);
  });

  it("rolls direct AI generation costs together with configured infra allocation", async () => {
    process.env.UNIT_ECONOMICS_MONTHLY_CONVEX_COST_USD = "12";
    process.env.UNIT_ECONOMICS_MONTHLY_FLY_COST_USD = "8";

    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "unit-economics-ai");

    const { callId, conversationId, messageId } = await t.run(async (ctx) => {
      const { conversationId } = await seedConversation(ctx, businessId);
      const nowIso = new Date().toISOString();
      const callId = await ctx.db.insert("calls", {
        businessId,
        conversationId,
        twilioCallSid: "CA-unit-economics-ai",
        status: "completed",
        providerCallStatus: "completed",
        startedAt: nowIso,
        endedAt: nowIso,
      });
      const messageId = await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        body: "Thanks for reaching out.",
        status: "queued",
        senderRole: "business_ai",
        aiGenerated: true,
      });

      return { callId, conversationId, messageId };
    });

    await t.mutation(internal.unitEconomics.recordAiGenerationCost, {
      businessId,
      occurredAt: new Date().toISOString(),
      eventKey: `voice_ai:response:${String(callId)}:resp-1`,
      eventKind: "voice_ai",
      channel: "voice",
      costUsd: 0.6,
      provider: "openai",
      model: "gpt-realtime",
      operation: "voice.response_generation",
      callId,
      conversationId,
    });
    await t.mutation(internal.unitEconomics.recordAiGenerationCost, {
      businessId,
      occurredAt: new Date().toISOString(),
      eventKey: `sms_ai:message:${String(messageId)}`,
      eventKind: "sms_ai",
      channel: "sms",
      costUsd: 0.15,
      provider: "google",
      model: "gemini-3.1-flash-lite-preview",
      operation: "sms.generate_reply",
      conversationId,
      messageId,
    });

    const summary = await authed.query(api.unitEconomics.getSummary, { businessId });

    expect(summary.rollup).not.toBeNull();
    expect(summary.rollup?.providerCostUsd).toBe(0);
    expect(summary.rollup?.aiCostUsd).toBe(0.75);
    expect(summary.rollup?.infraCostUsd).toBe(20);
    expect(summary.rollup?.totalCostUsd).toBe(20.75);
    expect(summary.rollup?.voiceCallCount).toBe(1);
    expect(summary.rollup?.outboundSmsCount).toBe(1);
    expect(summary.rollup?.activeUserCount).toBe(1);
    expect(summary.rollup?.priceFloorInputs.businessUsd).toBe(20.75);
    expect(summary.topVoiceCalls).toEqual([
      expect.objectContaining({
        callId,
        costUsd: 0.6,
      }),
    ]);
  });
});
