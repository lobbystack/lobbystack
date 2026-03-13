import { v } from "convex/values";

import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";

type KpiWindow = {
  current: number;
  previous: number;
};

function getMonthBoundary(date: Date, monthOffset: number): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1);
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
