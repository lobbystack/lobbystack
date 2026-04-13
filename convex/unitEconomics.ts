import { v } from "convex/values";

import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { enqueuePostHogEventBestEffort } from "./telemetry/posthog";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "./telemetry/shared";

type UnitEconomicsEventKind =
  | "voice_provider"
  | "sms_provider"
  | "notification_provider"
  | "sms_ai"
  | "voice_ai"
  | "dashboard_ai"
  | "infra_allocation";

type UnitEconomicsChannel = "voice" | "sms" | "platform" | "dashboard";
type QuantityUnit =
  | "call"
  | "minute"
  | "message"
  | "segment"
  | "thread"
  | "generation"
  | "business"
  | "user";

type CostEventInput = {
  businessId: Id<"businesses">;
  occurredAt: string;
  eventKey: string;
  eventKind: UnitEconomicsEventKind;
  channel: UnitEconomicsChannel;
  costUsd: number;
  quantity?: number;
  quantityUnit?: QuantityUnit;
  provider?: string;
  model?: string;
  operation?: string;
  callId?: Id<"calls">;
  conversationId?: Id<"conversations">;
  messageId?: Id<"messages">;
  notificationId?: Id<"notifications">;
};

function toMonthKey(value: string): string {
  return value.slice(0, 7);
}

function getCurrentMonthKey(): string {
  return toMonthKey(new Date().toISOString());
}

function getMonthStartIso(monthKey: string): string {
  return `${monthKey}-01T00:00:00.000Z`;
}

function getNextMonthStartIso(monthKey: string): string {
  const [rawYear, rawMonth] = monthKey.split("-");
  const year = Number(rawYear);
  const month = Number(rawMonth);
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function roundUnitCost(totalCostUsd: number, divisor: number): number {
  if (!Number.isFinite(divisor) || divisor <= 0) {
    return 0;
  }

  return roundUsd(totalCostUsd / divisor);
}

function parseOptionalNumber(
  source: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function parseOptionalString(
  source: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function buildVoiceProviderEventKey(callId: Id<"calls">): string {
  return `voice_provider:call:${String(callId)}`;
}

function buildSmsProviderEventKey(messageId: Id<"messages">): string {
  return `sms_provider:message:${String(messageId)}`;
}

function buildNotificationProviderEventKey(notificationId: Id<"notifications">): string {
  return `notification_provider:notification:${String(notificationId)}`;
}

async function countActiveBusinesses(ctx: MutationCtx): Promise<number> {
  const businesses = await ctx.db.query("businesses").collect();
  const activeBusinesses = businesses.filter((business) => business.status === "active");
  return Math.max(1, activeBusinesses.length);
}

async function countActiveUsers(
  ctx: MutationCtx | QueryCtx,
  businessId: Id<"businesses">,
): Promise<number> {
  const memberships = await ctx.db
    .query("business_memberships")
    .withIndex("by_business_id_and_role", (q) => q.eq("businessId", businessId))
    .collect();

  return new Set(
    memberships
      .filter((membership) => membership.status === "active")
      .map((membership) => String(membership.userId)),
  ).size;
}

function getConfiguredMonthlyInfraCostUsd(): number {
  const convexCost = Number(process.env.UNIT_ECONOMICS_MONTHLY_CONVEX_COST_USD ?? "0");
  const flyCost = Number(process.env.UNIT_ECONOMICS_MONTHLY_FLY_COST_USD ?? "0");
  const normalizedConvex = Number.isFinite(convexCost) ? convexCost : 0;
  const normalizedFly = Number.isFinite(flyCost) ? flyCost : 0;
  return roundUsd(Math.max(0, normalizedConvex) + Math.max(0, normalizedFly));
}

type UnitEconomicsRollupSnapshot =
  | Doc<"unit_economics_rollups">
  | Omit<Doc<"unit_economics_rollups">, "_id" | "_creationTime">;

async function recomputeMonthRollup(
  ctx: MutationCtx,
  args: {
    businessId: Id<"businesses">;
    monthKey: string;
  },
): Promise<UnitEconomicsRollupSnapshot> {
  const events = await ctx.db
    .query("unit_economics_events")
    .withIndex("by_business_id_and_month_key_and_occurred_at", (q) =>
      q.eq("businessId", args.businessId).eq("monthKey", args.monthKey),
    )
    .collect();

  const directCostExists = events.length > 0;
  const providerCostUsd = roundUsd(
    events
      .filter((event) =>
        event.eventKind === "voice_provider" ||
        event.eventKind === "sms_provider" ||
        event.eventKind === "notification_provider",
      )
      .reduce((sum, event) => sum + event.costUsd, 0),
  );
  const aiCostUsd = roundUsd(
    events
      .filter((event) =>
        event.eventKind === "voice_ai" ||
        event.eventKind === "sms_ai" ||
        event.eventKind === "dashboard_ai",
      )
      .reduce((sum, event) => sum + event.costUsd, 0),
  );
  const voiceCostUsd = roundUsd(
    events
      .filter((event) => event.channel === "voice")
      .reduce((sum, event) => sum + event.costUsd, 0),
  );
  const smsCostUsd = roundUsd(
    events
      .filter((event) => event.channel === "sms")
      .reduce((sum, event) => sum + event.costUsd, 0),
  );
  const alertSmsCostUsd = roundUsd(
    events
      .filter((event) => event.eventKind === "notification_provider")
      .reduce((sum, event) => sum + event.costUsd, 0),
  );
  const voiceCallCount = new Set(
    events
      .filter((event) => event.callId !== undefined)
      .map((event) => String(event.callId)),
  ).size;
  const voiceMinutes = roundUsd(
    events
      .filter((event) => event.channel === "voice" && event.quantityUnit === "minute")
      .reduce((sum, event) => sum + (event.quantity ?? 0), 0),
  );
  const outboundSmsCount = new Set(
    events
      .filter((event) => event.messageId !== undefined)
      .map((event) => String(event.messageId)),
  ).size;
  const smsThreadCount = new Set(
    events
      .filter((event) => event.channel === "sms" && event.conversationId !== undefined)
      .map((event) => String(event.conversationId)),
  ).size;
  const activeUserCount = await countActiveUsers(ctx, args.businessId);

  let infraCostUsd = 0;
  if (directCostExists) {
    const activeBusinessCount = await countActiveBusinesses(ctx);
    infraCostUsd = roundUnitCost(
      getConfiguredMonthlyInfraCostUsd(),
      activeBusinessCount,
    );
  }

  const totalCostUsd = roundUsd(providerCostUsd + aiCostUsd + infraCostUsd);
  const existingRollup = await ctx.db
    .query("unit_economics_rollups")
    .withIndex("by_business_id_and_month_key", (q) =>
      q.eq("businessId", args.businessId).eq("monthKey", args.monthKey),
    )
    .unique();

  const rollup = {
    businessId: args.businessId,
    monthKey: args.monthKey,
    totalCostUsd,
    providerCostUsd,
    aiCostUsd,
    infraCostUsd,
    voiceCostUsd,
    smsCostUsd,
    alertSmsCostUsd,
    voiceCallCount,
    voiceMinutes,
    outboundSmsCount,
    smsThreadCount,
    activeUserCount,
    costPerVoiceCallUsd: roundUnitCost(totalCostUsd, voiceCallCount),
    costPerVoiceMinuteUsd: roundUnitCost(totalCostUsd, voiceMinutes),
    costPerOutboundSmsUsd: roundUnitCost(totalCostUsd, outboundSmsCount),
    costPerSmsThreadUsd: roundUnitCost(totalCostUsd, smsThreadCount),
    costPerActiveUserUsd: roundUnitCost(totalCostUsd, activeUserCount),
    costPerBusinessUsd: totalCostUsd,
    recomputedAt: new Date().toISOString(),
  };

  if (existingRollup) {
    await ctx.db.patch(existingRollup._id, rollup);
    return {
      ...existingRollup,
      ...rollup,
    };
  }

  await ctx.db.insert("unit_economics_rollups", rollup);
  return rollup;
}

async function emitMonthRollupTelemetry(
  ctx: Pick<MutationCtx, "runMutation">,
  args: {
    businessId: Id<"businesses">;
    monthKey: string;
    rollup: UnitEconomicsRollupSnapshot;
  },
): Promise<void> {
  await enqueuePostHogEventBestEffort(ctx, {
    eventName: "ops.billing.unit_economics_rollup_recorded",
    businessId: args.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
    groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
    provider: "internal",
    properties: {
      monthKey: args.monthKey,
      totalCostUsd: args.rollup.totalCostUsd,
      providerCostUsd: args.rollup.providerCostUsd,
      aiCostUsd: args.rollup.aiCostUsd,
      infraCostUsd: args.rollup.infraCostUsd,
      voiceCostUsd: args.rollup.voiceCostUsd,
      smsCostUsd: args.rollup.smsCostUsd,
      alertSmsCostUsd: args.rollup.alertSmsCostUsd,
      voiceCallCount: args.rollup.voiceCallCount,
      voiceMinutes: args.rollup.voiceMinutes,
      outboundSmsCount: args.rollup.outboundSmsCount,
      smsThreadCount: args.rollup.smsThreadCount,
      activeUserCount: args.rollup.activeUserCount,
      costPerVoiceCallUsd: args.rollup.costPerVoiceCallUsd,
      costPerVoiceMinuteUsd: args.rollup.costPerVoiceMinuteUsd,
      costPerOutboundSmsUsd: args.rollup.costPerOutboundSmsUsd,
      costPerSmsThreadUsd: args.rollup.costPerSmsThreadUsd,
      costPerActiveUserUsd: args.rollup.costPerActiveUserUsd,
      costPerBusinessUsd: args.rollup.costPerBusinessUsd,
    },
  });
}

async function upsertCostEvent(
  ctx: MutationCtx,
  input: CostEventInput,
): Promise<void> {
  const existing = await ctx.db
    .query("unit_economics_events")
    .withIndex("by_event_key", (q) => q.eq("eventKey", input.eventKey))
    .unique();

  const document = {
    businessId: input.businessId,
    monthKey: toMonthKey(input.occurredAt),
    occurredAt: input.occurredAt,
    eventKey: input.eventKey,
    eventKind: input.eventKind,
    channel: input.channel,
    costUsd: roundUsd(input.costUsd),
    ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
    ...(input.quantityUnit !== undefined ? { quantityUnit: input.quantityUnit } : {}),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
    ...(input.callId !== undefined ? { callId: input.callId } : {}),
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
    ...(input.notificationId !== undefined ? { notificationId: input.notificationId } : {}),
  };

  if (existing) {
    await ctx.db.patch(existing._id, document);
  } else {
    await ctx.db.insert("unit_economics_events", document);
  }
}

async function backfillProviderCostsForMonth(
  ctx: MutationCtx,
  args: {
    businessId: Id<"businesses">;
    monthKey: string;
  },
): Promise<void> {
  const monthStart = getMonthStartIso(args.monthKey);
  const nextMonthStart = getNextMonthStartIso(args.monthKey);

  const calls = await ctx.db
    .query("calls")
    .withIndex("by_business_id_and_started_at", (q) =>
      q.eq("businessId", args.businessId).gte("startedAt", monthStart).lt("startedAt", nextMonthStart),
    )
    .collect();

  for (const call of calls) {
    if (call.providerCostUsd === undefined) {
      continue;
    }

    await upsertCostEvent(ctx, {
      businessId: call.businessId,
      occurredAt: call.providerUpdatedAt ?? call.endedAt ?? call.startedAt,
      eventKey: buildVoiceProviderEventKey(call._id),
      eventKind: "voice_provider",
      channel: "voice",
      costUsd: call.providerCostUsd,
      provider: "twilio",
      callId: call._id,
      ...(call.conversationId ? { conversationId: call.conversationId } : {}),
      ...(call.providerCallDurationSeconds !== undefined
        ? {
            quantity: roundUsd(call.providerCallDurationSeconds / 60),
            quantityUnit: "minute" as const,
          }
        : {}),
    });
  }

  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_business_id_and_scheduled_for", (q) =>
      q.eq("businessId", args.businessId)
        .gte("scheduledFor", monthStart)
        .lt("scheduledFor", nextMonthStart),
    )
    .collect();

  for (const notification of notifications) {
    if (notification.providerCostUsd === undefined) {
      continue;
    }

    await upsertCostEvent(ctx, {
      businessId: notification.businessId,
      occurredAt: notification.providerUpdatedAt ?? notification.scheduledFor,
      eventKey: buildNotificationProviderEventKey(notification._id),
      eventKind: "notification_provider",
      channel: "platform",
      costUsd: notification.providerCostUsd,
      provider: "twilio",
      notificationId: notification._id,
      ...(notification.providerNumSegments !== undefined
        ? {
            quantity: notification.providerNumSegments,
            quantityUnit: "segment" as const,
          }
        : {}),
    });
  }

  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_business_id_and_status", (q) => q.eq("businessId", args.businessId))
    .collect();

  for (const conversation of conversations) {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
      .collect();

    for (const message of messages) {
      if (
        message.direction !== "outbound" ||
        message.channel !== "sms" ||
        message.providerCostUsd === undefined ||
        toMonthKey(new Date(message._creationTime).toISOString()) !== args.monthKey
      ) {
        continue;
      }

      await upsertCostEvent(ctx, {
        businessId: message.businessId,
        occurredAt: message.providerUpdatedAt ?? new Date(message._creationTime).toISOString(),
        eventKey: buildSmsProviderEventKey(message._id),
        eventKind: "sms_provider",
        channel: "sms",
        costUsd: message.providerCostUsd,
        provider: "twilio",
        messageId: message._id,
        conversationId: message.conversationId,
        ...(message.providerNumSegments !== undefined
          ? {
              quantity: message.providerNumSegments,
              quantityUnit: "segment" as const,
            }
          : {}),
      });
    }
  }
}

async function backfillAiCostsFromTelemetryOutbox(
  ctx: MutationCtx,
  args: {
    businessId: Id<"businesses">;
    monthKey: string;
  },
): Promise<void> {
  const outboxRows = await ctx.db
    .query("telemetry_outbox")
    .withIndex("by_business_id_and_status", (q) => q.eq("businessId", args.businessId))
    .collect();

  for (const row of outboxRows) {
    if (row.eventName !== "$ai_generation") {
      continue;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    } catch {
      continue;
    }

    const occurredAt = parseOptionalString(payload, ["occurredAt"]);
    if (!occurredAt || toMonthKey(occurredAt) !== args.monthKey) {
      continue;
    }

    const properties = asRecord(payload.properties);
    const totalCostUsd = parseOptionalNumber(properties, [
      "totalCostUsd",
      "$ai_total_cost_usd",
    ]);
    if (totalCostUsd === undefined) {
      continue;
    }

    const channelValue = parseOptionalString(payload, ["channel"]);
    const channel: UnitEconomicsChannel =
      channelValue === "voice" ||
      channelValue === "sms" ||
      channelValue === "dashboard"
        ? channelValue
        : "dashboard";
    const eventKind: UnitEconomicsEventKind =
      channel === "voice"
        ? "voice_ai"
        : channel === "sms"
          ? "sms_ai"
          : "dashboard_ai";
    const provider = parseOptionalString(payload, ["provider"]);
    const model = parseOptionalString(payload, ["model"]);
    const operation = parseOptionalString(properties, ["operation"]);

    await upsertCostEvent(ctx, {
      businessId: args.businessId,
      occurredAt,
      eventKey: `telemetry_outbox:${String(row._id)}`,
      eventKind,
      channel,
      costUsd: totalCostUsd,
      quantity: 1,
      quantityUnit: "generation",
      ...(payload.callId ? { callId: payload.callId as Id<"calls"> } : {}),
      ...(payload.conversationId
        ? { conversationId: payload.conversationId as Id<"conversations"> }
        : {}),
      ...(payload.messageId ? { messageId: payload.messageId as Id<"messages"> } : {}),
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(operation ? { operation } : {}),
    });
  }
}

export const recordVoiceProviderCost = internalMutation({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    conversationId: v.optional(v.id("conversations")),
    occurredAt: v.string(),
    costUsd: v.number(),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await upsertCostEvent(ctx, {
      businessId: args.businessId,
      occurredAt: args.occurredAt,
      eventKey: buildVoiceProviderEventKey(args.callId),
      eventKind: "voice_provider",
      channel: "voice",
      costUsd: args.costUsd,
      provider: "twilio",
      callId: args.callId,
      ...(args.conversationId ? { conversationId: args.conversationId } : {}),
      ...(args.durationSeconds !== undefined
        ? {
            quantity: roundUsd(args.durationSeconds / 60),
            quantityUnit: "minute" as const,
          }
        : {}),
    });
    const monthKey = toMonthKey(args.occurredAt);
    const rollup = await recomputeMonthRollup(ctx, {
      businessId: args.businessId,
      monthKey,
    });
    await emitMonthRollupTelemetry(ctx, {
      businessId: args.businessId,
      monthKey,
      rollup,
    });
    return null;
  },
});

export const recordSmsProviderCost = internalMutation({
  args: {
    businessId: v.id("businesses"),
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    occurredAt: v.string(),
    costUsd: v.number(),
    numSegments: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await upsertCostEvent(ctx, {
      businessId: args.businessId,
      occurredAt: args.occurredAt,
      eventKey: buildSmsProviderEventKey(args.messageId),
      eventKind: "sms_provider",
      channel: "sms",
      costUsd: args.costUsd,
      provider: "twilio",
      messageId: args.messageId,
      conversationId: args.conversationId,
      ...(args.numSegments !== undefined
        ? {
            quantity: args.numSegments,
            quantityUnit: "segment" as const,
          }
        : {}),
    });
    const monthKey = toMonthKey(args.occurredAt);
    const rollup = await recomputeMonthRollup(ctx, {
      businessId: args.businessId,
      monthKey,
    });
    await emitMonthRollupTelemetry(ctx, {
      businessId: args.businessId,
      monthKey,
      rollup,
    });
    return null;
  },
});

export const recordNotificationProviderCost = internalMutation({
  args: {
    businessId: v.id("businesses"),
    notificationId: v.id("notifications"),
    occurredAt: v.string(),
    costUsd: v.number(),
    numSegments: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await upsertCostEvent(ctx, {
      businessId: args.businessId,
      occurredAt: args.occurredAt,
      eventKey: buildNotificationProviderEventKey(args.notificationId),
      eventKind: "notification_provider",
      channel: "platform",
      costUsd: args.costUsd,
      provider: "twilio",
      notificationId: args.notificationId,
      ...(args.numSegments !== undefined
        ? {
            quantity: args.numSegments,
            quantityUnit: "segment" as const,
          }
        : {}),
    });
    const monthKey = toMonthKey(args.occurredAt);
    const rollup = await recomputeMonthRollup(ctx, {
      businessId: args.businessId,
      monthKey,
    });
    await emitMonthRollupTelemetry(ctx, {
      businessId: args.businessId,
      monthKey,
      rollup,
    });
    return null;
  },
});

export const recordAiGenerationCost = internalMutation({
  args: {
    businessId: v.id("businesses"),
    occurredAt: v.string(),
    eventKey: v.string(),
    eventKind: v.union(
      v.literal("sms_ai"),
      v.literal("voice_ai"),
      v.literal("dashboard_ai"),
    ),
    channel: v.union(v.literal("sms"), v.literal("voice"), v.literal("dashboard")),
    costUsd: v.number(),
    provider: v.string(),
    model: v.string(),
    operation: v.optional(v.string()),
    callId: v.optional(v.id("calls")),
    conversationId: v.optional(v.id("conversations")),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    await upsertCostEvent(ctx, {
      businessId: args.businessId,
      occurredAt: args.occurredAt,
      eventKey: args.eventKey,
      eventKind: args.eventKind,
      channel: args.channel,
      costUsd: args.costUsd,
      quantity: 1,
      quantityUnit: "generation",
      provider: args.provider,
      model: args.model,
      ...(args.operation ? { operation: args.operation } : {}),
      ...(args.callId ? { callId: args.callId } : {}),
      ...(args.conversationId ? { conversationId: args.conversationId } : {}),
      ...(args.messageId ? { messageId: args.messageId } : {}),
    });
    const monthKey = toMonthKey(args.occurredAt);
    const rollup = await recomputeMonthRollup(ctx, {
      businessId: args.businessId,
      monthKey,
    });
    await emitMonthRollupTelemetry(ctx, {
      businessId: args.businessId,
      monthKey,
      rollup,
    });
    return null;
  },
});

export const refreshMonth = mutation({
  args: {
    businessId: v.id("businesses"),
    monthKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const monthKey = args.monthKey ?? getCurrentMonthKey();
    await backfillProviderCostsForMonth(ctx, {
      businessId: args.businessId,
      monthKey,
    });
    await backfillAiCostsFromTelemetryOutbox(ctx, {
      businessId: args.businessId,
      monthKey,
    });
    const rollup = await recomputeMonthRollup(ctx, {
      businessId: args.businessId,
      monthKey,
    });
    await emitMonthRollupTelemetry(ctx, {
      businessId: args.businessId,
      monthKey,
      rollup,
    });

    return { monthKey };
  },
});

export const getSummary = query({
  args: {
    businessId: v.id("businesses"),
    monthKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const monthKey = args.monthKey ?? getCurrentMonthKey();
    const rollup = await ctx.db
      .query("unit_economics_rollups")
      .withIndex("by_business_id_and_month_key", (q) =>
        q.eq("businessId", args.businessId).eq("monthKey", monthKey),
      )
      .unique();

    return {
      monthKey,
      rollup: rollup
        ? {
            ...rollup,
            priceFloorInputs: {
              voiceCallUsd: rollup.costPerVoiceCallUsd,
              outboundSmsUsd: rollup.costPerOutboundSmsUsd,
              activeUserUsd: rollup.costPerActiveUserUsd,
            },
            channelMix: [
              { key: "voice", value: rollup.voiceCostUsd },
              { key: "sms", value: rollup.smsCostUsd },
              { key: "alerts", value: rollup.alertSmsCostUsd },
            ],
          }
        : null,
    };
  },
});
