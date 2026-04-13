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

async function refreshMonthUntilDone(
  authed: { mutation: (ref: unknown, args: unknown) => Promise<any> },
  businessId: Id<"businesses">,
  monthKey?: string,
) {
  let state: Record<string, unknown> | undefined;

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await authed.mutation(api.unitEconomics.refreshMonth as unknown, {
      businessId,
      ...(monthKey ? { monthKey } : {}),
      ...(state ? { state } : {}),
    });

    if (result.done) {
      return result;
    }

    state = result.state;
  }

  throw new Error("refreshMonth did not complete within 200 steps");
}

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

    await t.run(async (ctx) => {
      const { conversationId } = await seedConversation(ctx, businessId);
      const nowIso = new Date().toISOString();
      await ctx.db.insert("calls", {
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

    });

    await refreshMonthUntilDone(authed, businessId);
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
    expect(summary.rollup?.channelMix).toEqual([
      { key: "voice", value: 0.04 },
      { key: "sms", value: 0.02 },
      { key: "alerts", value: 0.01 },
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
    expect(summary.rollup?.priceFloorInputs.activeUserUsd).toBe(20.75);
    expect(summary.rollup?.channelMix).toEqual([
      { key: "voice", value: 0.6 },
      { key: "sms", value: 0.15 },
      { key: "alerts", value: 0 },
    ]);
  });

  it("does not double count AI costs that are already recorded directly", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "unit-economics-dedup");

    const { conversationId, messageId } = await t.run(async (ctx) => {
      const { conversationId } = await seedConversation(ctx, businessId);
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

      return { conversationId, messageId };
    });

    const occurredAt = new Date().toISOString();
    await t.mutation(internal.unitEconomics.recordAiGenerationCost, {
      businessId,
      occurredAt,
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

    await t.run(async (ctx) => {
      await ctx.db.insert("telemetry_outbox", {
        destination: "posthog",
        status: "pending",
        availableAt: occurredAt,
        attemptCount: 0,
        eventName: "$ai_generation",
        distinctId: "system:business",
        businessId,
        groupKey: "business:unit-economics-dedup",
        payloadJson: JSON.stringify({
          occurredAt,
          conversationId,
          messageId,
          provider: "google",
          model: "gemini-3.1-flash-lite-preview",
          properties: {
            totalCostUsd: 0.15,
            $ai_total_cost_usd: 0.15,
            channel: "sms",
            operation: "sms.generate_reply",
          },
        }),
      });
    });

    await refreshMonthUntilDone(authed, businessId);
    const summary = await authed.query(api.unitEconomics.getSummary, { businessId });

    expect(summary.rollup).not.toBeNull();
    expect(summary.rollup?.aiCostUsd).toBe(0.15);
    expect(summary.rollup?.totalCostUsd).toBe(0.15);
    expect(summary.rollup?.outboundSmsCount).toBe(1);
  });

  it("imports telemetry-only AI costs when no direct event exists yet", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "unit-economics-telemetry-only");

    const { conversationId, messageId } = await t.run(async (ctx) => {
      const { conversationId } = await seedConversation(ctx, businessId);
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

      await ctx.db.insert("telemetry_outbox", {
        destination: "posthog",
        status: "pending",
        availableAt: new Date().toISOString(),
        attemptCount: 0,
        eventName: "$ai_generation",
        distinctId: "system:business",
        businessId,
        groupKey: "business:unit-economics-telemetry-only",
        payloadJson: JSON.stringify({
          occurredAt: new Date().toISOString(),
          conversationId,
          messageId,
          provider: "google",
          model: "gemini-3.1-flash-lite-preview",
          properties: {
            totalCostUsd: 0.15,
            $ai_total_cost_usd: 0.15,
            channel: "sms",
            operation: "sms.generate_reply",
            messageId,
          },
        }),
      });

      return { conversationId, messageId };
    });

    await refreshMonthUntilDone(authed, businessId);
    const summary = await authed.query(api.unitEconomics.getSummary, { businessId });

    expect(summary.rollup).not.toBeNull();
    expect(summary.rollup?.aiCostUsd).toBe(0.15);
    expect(summary.rollup?.totalCostUsd).toBe(0.15);
    expect(summary.rollup?.outboundSmsCount).toBe(1);
    expect(conversationId).toBeTruthy();
    expect(messageId).toBeTruthy();
  });

  it("reuses the last infra allocation during direct event recomputes", async () => {
    process.env.UNIT_ECONOMICS_MONTHLY_CONVEX_COST_USD = "12";
    process.env.UNIT_ECONOMICS_MONTHLY_FLY_COST_USD = "8";

    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "unit-economics-infra-stable");
    await seedBusinessMember(t, "unit-economics-infra-stable-peer");

    const { conversationId, firstMessageId, secondMessageId } = await t.run(async (ctx) => {
      const { conversationId } = await seedConversation(ctx, businessId);
      const firstMessageId = await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        body: "First reply.",
        status: "queued",
        senderRole: "business_ai",
        aiGenerated: true,
      });
      const secondMessageId = await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        body: "Second reply.",
        status: "queued",
        senderRole: "business_ai",
        aiGenerated: true,
      });

      return { conversationId, firstMessageId, secondMessageId };
    });

    await t.mutation(internal.unitEconomics.recordAiGenerationCost, {
      businessId,
      occurredAt: new Date().toISOString(),
      eventKey: `sms_ai:message:${String(firstMessageId)}`,
      eventKind: "sms_ai",
      channel: "sms",
      costUsd: 0.15,
      provider: "google",
      model: "gemini-3.1-flash-lite-preview",
      operation: "sms.generate_reply",
      conversationId,
      messageId: firstMessageId,
    });

    await refreshMonthUntilDone(authed, businessId);

    await t.mutation(internal.unitEconomics.recordAiGenerationCost, {
      businessId,
      occurredAt: new Date().toISOString(),
      eventKey: `sms_ai:message:${String(secondMessageId)}`,
      eventKind: "sms_ai",
      channel: "sms",
      costUsd: 0.25,
      provider: "google",
      model: "gemini-3.1-flash-lite-preview",
      operation: "sms.generate_reply",
      conversationId,
      messageId: secondMessageId,
    });

    const summary = await authed.query(api.unitEconomics.getSummary, { businessId });

    expect(summary.rollup).not.toBeNull();
    expect(summary.rollup?.infraCostUsd).toBe(10);
    expect(summary.rollup?.aiCostUsd).toBe(0.4);
    expect(summary.rollup?.totalCostUsd).toBe(10.4);
  });

  it("backfills provider costs into the month they were recorded", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "unit-economics-provider-month");

    await t.run(async (ctx) => {
      const { conversationId } = await seedConversation(ctx, businessId);
      await ctx.db.insert("calls", {
        businessId,
        conversationId,
        twilioCallSid: "CA-unit-economics-provider-month",
        status: "completed",
        providerCallStatus: "completed",
        providerCallDurationSeconds: 120,
        providerCostUsd: 0.05,
        startedAt: "2026-03-31T23:58:00.000Z",
        endedAt: "2026-03-31T23:59:00.000Z",
        providerUpdatedAt: "2026-04-01T00:02:00.000Z",
      });
    });

    await refreshMonthUntilDone(authed, businessId, "2026-04");
    const summary = await authed.query(api.unitEconomics.getSummary, {
      businessId,
      monthKey: "2026-04",
    });

    expect(summary.rollup).not.toBeNull();
    expect(summary.rollup?.providerCostUsd).toBe(0.05);
    expect(summary.rollup?.voiceCallCount).toBe(1);
    expect(summary.rollup?.voiceMinutes).toBe(2);
  });

  it("recomputes both months when provider pricing moves across a month boundary", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "unit-economics-month-shift");

    const { conversationId, messageId } = await t.run(async (ctx) => {
      const { conversationId } = await seedConversation(ctx, businessId);
      const messageId = await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        body: "Month shift correction.",
        status: "sent",
        senderRole: "business_ai",
        aiGenerated: true,
        providerCostUsd: 0.02,
        providerNumSegments: 1,
        providerUpdatedAt: "2026-03-31T23:59:00.000Z",
      });

      return { conversationId, messageId };
    });

    await t.mutation(internal.unitEconomics.recordSmsProviderCost, {
      businessId,
      messageId,
      conversationId,
      occurredAt: "2026-03-31T23:59:00.000Z",
      costUsd: 0.02,
      numSegments: 1,
    });

    await t.mutation(internal.unitEconomics.recordSmsProviderCost, {
      businessId,
      messageId,
      conversationId,
      occurredAt: "2026-04-01T00:02:00.000Z",
      costUsd: 0.02,
      numSegments: 1,
    });

    const marchSummary = await authed.query(api.unitEconomics.getSummary, {
      businessId,
      monthKey: "2026-03",
    });
    const aprilSummary = await authed.query(api.unitEconomics.getSummary, {
      businessId,
      monthKey: "2026-04",
    });

    expect(marchSummary.rollup).not.toBeNull();
    expect(marchSummary.rollup?.providerCostUsd).toBe(0);
    expect(marchSummary.rollup?.outboundSmsCount).toBe(0);

    expect(aprilSummary.rollup).not.toBeNull();
    expect(aprilSummary.rollup?.providerCostUsd).toBe(0.02);
    expect(aprilSummary.rollup?.outboundSmsCount).toBe(1);
  });

  it("processes large refreshes across multiple mutation batches", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "unit-economics-batches");

    await t.run(async (ctx) => {
      const nowIso = "2026-04-11T12:00:00.000Z";

      for (let index = 0; index < 55; index += 1) {
        const { conversationId } = await seedConversation(ctx, businessId);
        await ctx.db.insert("messages", {
          businessId,
          conversationId,
          direction: "outbound",
          channel: "sms",
          body: `Batch message ${index}`,
          status: "sent",
          senderRole: "business_ai",
          aiGenerated: true,
          providerCostUsd: 0.01,
          providerNumSegments: 1,
          providerUpdatedAt: nowIso,
        });
      }
    });

    await refreshMonthUntilDone(authed, businessId, "2026-04");
    const summary = await authed.query(api.unitEconomics.getSummary, {
      businessId,
      monthKey: "2026-04",
    });

    expect(summary.rollup).not.toBeNull();
    expect(summary.rollup?.providerCostUsd).toBe(0.55);
    expect(summary.rollup?.outboundSmsCount).toBe(55);
  });
});
