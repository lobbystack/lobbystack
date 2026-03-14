import { v } from "convex/values";

import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";

type KpiWindow = {
  current: number;
  previous: number;
};

type AverageWindow = {
  current: number;
  previous: number;
};

function getMonthBoundary(date: Date, monthOffset: number): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1);
}

function getWeekStartBoundary(date: Date, weekOffset: number): number {
  const startOfCurrentDay = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const currentWeekday = date.getUTCDay();
  return startOfCurrentDay - currentWeekday * 24 * 60 * 60 * 1000 + weekOffset * 7 * 24 * 60 * 60 * 1000;
}

function toMonthKey(value: string): string {
  return value.slice(0, 7);
}

function buildKpiWindow(
  timestamps: Array<number>,
  currentMonthStart: number,
  nextMonthStart: number,
  previousMonthStart: number,
): KpiWindow {
  let current = 0;
  let previous = 0;

  for (const timestamp of timestamps) {
    if (timestamp >= currentMonthStart && timestamp < nextMonthStart) {
      current += 1;
      continue;
    }

    if (timestamp >= previousMonthStart && timestamp < currentMonthStart) {
      previous += 1;
    }
  }

  return { current, previous };
}

function calculateDeltaPercent(window: KpiWindow): number {
  if (window.previous === 0) {
    return window.current === 0 ? 0 : 100;
  }

  return Number((((window.current - window.previous) / window.previous) * 100).toFixed(1));
}

function buildAverageWindow(
  values: Array<{ timestamp: number; durationSeconds: number | null | undefined }>,
  currentStart: number,
  nextStart: number,
  previousStart: number,
): AverageWindow {
  let currentSum = 0;
  let currentCount = 0;
  let previousSum = 0;
  let previousCount = 0;

  for (const value of values) {
    if (value.durationSeconds === null || value.durationSeconds === undefined) {
      continue;
    }

    if (value.timestamp >= currentStart && value.timestamp < nextStart) {
      currentSum += value.durationSeconds;
      currentCount += 1;
      continue;
    }

    if (value.timestamp >= previousStart && value.timestamp < currentStart) {
      previousSum += value.durationSeconds;
      previousCount += 1;
    }
  }

  return {
    current: currentCount === 0 ? 0 : Math.round(currentSum / currentCount),
    previous: previousCount === 0 ? 0 : Math.round(previousSum / previousCount),
  };
}

function toDayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function incrementCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function categorizeCallOutcome(call: Doc<"calls">): "completed" | "live" | "missed" | "transferred" {
  if (call.transferState && call.transferState !== "idle") {
    return "transferred";
  }

  if (call.status === "open" || call.status === "in_progress") {
    return "live";
  }

  const disposition = call.disposition?.toLowerCase() ?? "";
  const providerStatus = call.providerCallStatus?.toLowerCase() ?? "";
  const status = call.status.toLowerCase();
  const hadDuration = (call.providerCallDurationSeconds ?? 0) > 0;

  if (
    disposition.includes("miss") ||
    disposition.includes("voicemail") ||
    disposition.includes("busy") ||
    disposition.includes("no_answer") ||
    providerStatus.includes("no-answer") ||
    providerStatus.includes("busy") ||
    providerStatus.includes("failed") ||
    status.includes("failed")
  ) {
    return "missed";
  }

  if (hadDuration || status === "completed") {
    return "completed";
  }

  return "missed";
}

function categorizeConversationChannel(channel: string): "voice" | "sms" | "other" {
  const normalized = channel.toLowerCase();
  if (normalized.includes("voice") || normalized.includes("call")) {
    return "voice";
  }

  if (normalized.includes("sms") || normalized.includes("message")) {
    return "sms";
  }

  return "other";
}

async function getConversationContact(
  ctx: QueryCtx,
  conversationId: Id<"conversations"> | undefined,
): Promise<Doc<"contacts"> | null> {
  if (!conversationId) {
    return null;
  }

  const conversation = await ctx.db.get(conversationId);
  if (!conversation?.contactId) {
    return null;
  }

  return await ctx.db.get(conversation.contactId);
}

export const getHomeSummary = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const now = new Date();
    const currentMonthStart = getMonthBoundary(now, 0);
    const nextMonthStart = getMonthBoundary(now, 1);
    const previousMonthStart = getMonthBoundary(now, -1);
    const seriesMonthStart = getMonthBoundary(now, -11);

    const [calls, appointments, contacts, conversations] = await Promise.all([
      ctx.db
        .query("calls")
        .withIndex("by_business_id_and_started_at", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("appointments")
        .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("contacts")
        .withIndex("by_business_id_and_phone", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_status", (q) => q.eq("businessId", args.businessId))
        .collect(),
    ]);

    const messagesByConversation = await Promise.all(
      conversations.map(async (conversation) => ({
        conversationId: conversation._id,
        messages: await ctx.db
          .query("messages")
          .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
          .collect(),
      })),
    );

    const allMessages = messagesByConversation.flatMap((entry) => entry.messages);
    const callsThisMonth = buildKpiWindow(
      calls.map((call) => Date.parse(call.startedAt)),
      currentMonthStart,
      nextMonthStart,
      previousMonthStart,
    );
    const messagesThisMonth = buildKpiWindow(
      allMessages.map((message) => message._creationTime),
      currentMonthStart,
      nextMonthStart,
      previousMonthStart,
    );
    const appointmentsThisMonth = buildKpiWindow(
      appointments.map((appointment) => Date.parse(appointment.startsAt)),
      currentMonthStart,
      nextMonthStart,
      previousMonthStart,
    );
    const contactsThisMonth = buildKpiWindow(
      contacts.map((contact) => contact._creationTime),
      currentMonthStart,
      nextMonthStart,
      previousMonthStart,
    );

    const monthlyCallsMap = new Map<string, number>();
    for (const call of calls) {
      const startedAtMs = Date.parse(call.startedAt);
      if (startedAtMs < seriesMonthStart) {
        continue;
      }

      const monthKey = toMonthKey(call.startedAt);
      monthlyCallsMap.set(monthKey, (monthlyCallsMap.get(monthKey) ?? 0) + 1);
    }

    const monthlyCalls = Array.from({ length: 12 }, (_, index) => {
      const monthStart = new Date(getMonthBoundary(now, index - 11));
      const monthKey = monthStart.toISOString().slice(0, 7);
      return {
        monthStart: monthStart.toISOString(),
        total: monthlyCallsMap.get(monthKey) ?? 0,
      };
    });

    const recentCalls = await Promise.all(
      calls
        .slice()
        .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
        .slice(0, 5)
        .map(async (call) => {
          const [contact, transcriptPreview] = await Promise.all([
            getConversationContact(ctx, call.conversationId),
            ctx.db
              .query("transcripts")
              .withIndex("by_call_id_and_sequence", (q) => q.eq("callId", call._id))
              .take(1),
          ]);

          return {
            id: call._id,
            startedAt: call.startedAt,
            status: call.status,
            disposition: call.disposition ?? null,
            durationSeconds: call.providerCallDurationSeconds ?? null,
            transcriptReady: transcriptPreview.length > 0,
            recordingAvailable: call.recordingStorageId !== undefined,
            contactName: contact?.name ?? null,
            contactPhone: contact?.phone ?? null,
          };
        }),
    );

    const liveCalls = calls.filter(
      (call) => call.status === "in_progress" || call.status === "open",
    ).length;

    return {
      generatedAt: new Date().toISOString(),
      kpis: {
        calls: {
          total: calls.length,
          currentMonth: callsThisMonth.current,
          previousMonth: callsThisMonth.previous,
          deltaPercent: calculateDeltaPercent(callsThisMonth),
        },
        messages: {
          total: allMessages.length,
          currentMonth: messagesThisMonth.current,
          previousMonth: messagesThisMonth.previous,
          deltaPercent: calculateDeltaPercent(messagesThisMonth),
        },
        appointments: {
          total: appointments.length,
          currentMonth: appointmentsThisMonth.current,
          previousMonth: appointmentsThisMonth.previous,
          deltaPercent: calculateDeltaPercent(appointmentsThisMonth),
        },
        contacts: {
          total: contacts.length,
          currentMonth: contactsThisMonth.current,
          previousMonth: contactsThisMonth.previous,
          deltaPercent: calculateDeltaPercent(contactsThisMonth),
        },
      },
      liveCalls,
      monthlyCalls,
      recentCalls,
    };
  },
});

export const getAnalyticsSummary = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const now = new Date();
    const currentWeekStart = getWeekStartBoundary(now, 0);
    const previousWeekStart = getWeekStartBoundary(now, -1);
    const nextWeekStart = getWeekStartBoundary(now, 1);

    const [calls, appointments, conversations] = await Promise.all([
      ctx.db
        .query("calls")
        .withIndex("by_business_id_and_started_at", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("appointments")
        .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_status", (q) => q.eq("businessId", args.businessId))
        .collect(),
    ]);

    const messagesByConversation = await Promise.all(
      conversations.map(async (conversation) =>
        ctx.db
          .query("messages")
          .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
          .collect(),
      ),
    );

    const allMessages = messagesByConversation.flat();

    const callWindow = buildKpiWindow(
      calls.map((call) => Date.parse(call.startedAt)),
      currentWeekStart,
      nextWeekStart,
      previousWeekStart,
    );
    const messageWindow = buildKpiWindow(
      allMessages.map((message) => message._creationTime),
      currentWeekStart,
      nextWeekStart,
      previousWeekStart,
    );
    const appointmentWindow = buildKpiWindow(
      appointments.map((appointment) => Date.parse(appointment.startsAt)),
      currentWeekStart,
      nextWeekStart,
      previousWeekStart,
    );
    const averageDurationWindow = buildAverageWindow(
      calls.map((call) => ({
        timestamp: Date.parse(call.startedAt),
        durationSeconds: call.providerCallDurationSeconds,
      })),
      currentWeekStart,
      nextWeekStart,
      previousWeekStart,
    );

    const callCountsByDay = new Map<string, number>();
    const messageCountsByDay = new Map<string, number>();
    for (const call of calls) {
      const timestamp = Date.parse(call.startedAt);
      if (timestamp < currentWeekStart || timestamp >= nextWeekStart) {
        continue;
      }
      incrementCount(callCountsByDay, toDayKey(timestamp));
    }

    for (const message of allMessages) {
      if (message._creationTime < currentWeekStart || message._creationTime >= nextWeekStart) {
        continue;
      }
      incrementCount(messageCountsByDay, toDayKey(message._creationTime));
    }

    const weeklySeries = Array.from({ length: 7 }, (_, index) => {
      const dayStart = new Date(currentWeekStart + index * 24 * 60 * 60 * 1000);
      const dayKey = dayStart.toISOString().slice(0, 10);
      return {
        dayStart: dayStart.toISOString(),
        calls: callCountsByDay.get(dayKey) ?? 0,
        messages: messageCountsByDay.get(dayKey) ?? 0,
      };
    });

    const currentWeekCalls = calls.filter((call) => {
      const timestamp = Date.parse(call.startedAt);
      return timestamp >= currentWeekStart && timestamp < nextWeekStart;
    });

    const outcomes = {
      completed: 0,
      live: 0,
      missed: 0,
      transferred: 0,
    };
    for (const call of currentWeekCalls) {
      outcomes[categorizeCallOutcome(call)] += 1;
    }

    const currentWeekConversations = conversations.filter(
      (conversation) =>
        conversation._creationTime >= currentWeekStart && conversation._creationTime < nextWeekStart,
    );
    const channels = {
      voice: 0,
      sms: 0,
      other: 0,
    };
    for (const conversation of currentWeekConversations) {
      channels[categorizeConversationChannel(conversation.channel)] += 1;
    }

    const channelTotal = Object.values(channels).reduce((sum, value) => sum + value, 0);

    return {
      generatedAt: new Date().toISOString(),
      weeklySeries,
      metrics: {
        calls: {
          value: callWindow.current,
          deltaPercent: calculateDeltaPercent(callWindow),
        },
        messages: {
          value: messageWindow.current,
          deltaPercent: calculateDeltaPercent(messageWindow),
        },
        appointments: {
          value: appointmentWindow.current,
          deltaPercent: calculateDeltaPercent(appointmentWindow),
        },
        averageCallDurationSeconds: {
          value: averageDurationWindow.current,
          deltaSeconds: averageDurationWindow.current - averageDurationWindow.previous,
        },
      },
      outcomes: [
        { key: "completed", value: outcomes.completed },
        { key: "transferred", value: outcomes.transferred },
        { key: "live", value: outcomes.live },
        { key: "missed", value: outcomes.missed },
      ],
      channels: [
        {
          key: "voice",
          value: channelTotal === 0 ? 0 : Math.round((channels.voice / channelTotal) * 100),
        },
        {
          key: "sms",
          value: channelTotal === 0 ? 0 : Math.round((channels.sms / channelTotal) * 100),
        },
        {
          key: "other",
          value: channelTotal === 0 ? 0 : Math.max(0, 100 - Math.round((channels.voice / channelTotal) * 100) - Math.round((channels.sms / channelTotal) * 100)),
        },
      ],
    };
  },
});
