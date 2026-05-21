import { v } from "convex/values";
import {
  DEFAULT_WEB_CALL_MAX_DURATION_MS,
  WEB_CALL_STALE_GRACE_MS,
} from "../../packages/shared/src/index";

import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";
import { getLocalizedServiceName } from "../lib/serviceNames";
import {
  getVisibleInboxItemBody,
  getVisibleInboxItemTitle,
  getVisibleMessageBody,
  isCallRecordingExpired,
  isMessageContentExpired,
  isTranscriptExpired,
} from "../privacy/retention";

type KpiWindow = {
  current: number;
  previous: number;
};

type AverageWindow = {
  current: number;
  previous: number;
};

type AnalyticsGranularity = "daily" | "hourly" | "monthly" | "weekly" | "yearly";

type DurationPoint = {
  timestamp: number;
  durationSeconds: number;
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

function getDefaultAnalyticsRange(date: Date): { start: number; end: number } {
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  const start = end - 30 * 24 * 60 * 60 * 1000;
  return { start, end };
}

function getPreviousRangeStart(start: number, end: number): number {
  return start - Math.max(end - start, 1);
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

function calculateAverageDurationSeconds(
  values: Array<number | null | undefined>,
): number {
  let sum = 0;
  let count = 0;

  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    sum += value;
    count += 1;
  }

  return count === 0 ? 0 : Math.round(sum / count);
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

function getBucketStart(timestamp: number, granularity: AnalyticsGranularity): number {
  const date = new Date(timestamp);

  if (granularity === "hourly") {
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
    );
  }

  if (granularity === "weekly") {
    return getWeekStartBoundary(date, 0);
  }

  if (granularity === "monthly") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }

  if (granularity === "yearly") {
    return Date.UTC(date.getUTCFullYear(), 0, 1);
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getNextBucketStart(bucketStart: number, granularity: AnalyticsGranularity): number {
  const date = new Date(bucketStart);

  if (granularity === "hourly") {
    return bucketStart + 60 * 60 * 1000;
  }

  if (granularity === "weekly") {
    return bucketStart + 7 * 24 * 60 * 60 * 1000;
  }

  if (granularity === "monthly") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }

  if (granularity === "yearly") {
    return Date.UTC(date.getUTCFullYear() + 1, 0, 1);
  }

  return bucketStart + 24 * 60 * 60 * 1000;
}

function buildBucketStarts(
  start: number,
  end: number,
  granularity: AnalyticsGranularity,
): Array<number> {
  const starts: Array<number> = [];
  let cursor = getBucketStart(start, granularity);

  while (cursor < end && starts.length < 500) {
    starts.push(cursor);
    cursor = getNextBucketStart(cursor, granularity);
  }

  return starts;
}

function buildBucketAverageDurationMap(
  values: Array<DurationPoint>,
  granularity: AnalyticsGranularity,
): Map<string, number> {
  const sums = new Map<string, { sum: number; count: number }>();

  for (const value of values) {
    const bucketKey = new Date(getBucketStart(value.timestamp, granularity)).toISOString();
    const bucket = sums.get(bucketKey) ?? { sum: 0, count: 0 };
    bucket.sum += value.durationSeconds;
    bucket.count += 1;
    sums.set(bucketKey, bucket);
  }

  return new Map(
    Array.from(sums.entries()).map(([bucketKey, bucket]) => [
      bucketKey,
      Math.round(bucket.sum / bucket.count),
    ]),
  );
}

function buildAgentResponseValues(messages: Array<Doc<"messages">>): Array<DurationPoint> {
  const messagesByConversation = new Map<Id<"conversations">, Array<Doc<"messages">>>();

  for (const message of messages) {
    const conversationMessages = messagesByConversation.get(message.conversationId) ?? [];
    conversationMessages.push(message);
    messagesByConversation.set(message.conversationId, conversationMessages);
  }

  const responseValues: Array<DurationPoint> = [];

  for (const conversationMessages of messagesByConversation.values()) {
    conversationMessages.sort((left, right) => left._creationTime - right._creationTime);

    let pendingInboundAt: number | null = null;
    for (const message of conversationMessages) {
      if (message.direction === "inbound") {
        pendingInboundAt = message._creationTime;
        continue;
      }

      if (message.direction !== "outbound" || !message.aiGenerated || pendingInboundAt === null) {
        continue;
      }

      responseValues.push({
        timestamp: message._creationTime,
        durationSeconds: Math.max(
          0,
          Math.round((message._creationTime - pendingInboundAt) / 1000),
        ),
      });
      pendingInboundAt = null;
    }
  }

  return responseValues;
}

export function buildAgentResponseWindow(
  messages: Array<Doc<"messages">>,
  currentStart: number,
  nextStart: number,
  previousStart: number,
): AverageWindow {
  return buildAverageWindow(
    buildAgentResponseValues(messages),
    currentStart,
    nextStart,
    previousStart,
  );
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

export const WEBRTC_LIVE_CALL_GRACE_MS = DEFAULT_WEB_CALL_MAX_DURATION_MS + WEB_CALL_STALE_GRACE_MS;

export function isCallLiveForDashboard(
  call: Pick<Doc<"calls">, "status" | "transport" | "startedAt" | "webCallMaxDurationMs">,
  nowMs = Date.now(),
): boolean {
  if (call.status !== "in_progress" && call.status !== "open") {
    return false;
  }

  if (call.transport !== "webrtc") {
    return true;
  }

  const startedAtMs = Date.parse(call.startedAt);
  const liveGraceMs = (call.webCallMaxDurationMs ?? DEFAULT_WEB_CALL_MAX_DURATION_MS) +
    WEB_CALL_STALE_GRACE_MS;
  return Number.isFinite(startedAtMs) && nowMs - startedAtMs <= liveGraceMs;
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

function dedupeVoiceFollowUpItems(
  items: Array<Doc<"inbox_items">>,
): Array<Doc<"inbox_items">> {
  const seen = new Set<string>();
  const deduped: Array<Doc<"inbox_items">> = [];

  for (const item of items) {
    const key = item.relatedId ?? String(item._id);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export const getHomeSummary = query({
  args: {
    businessId: v.id("businesses"),
    locale: v.union(v.literal("en"), v.literal("fr")),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const now = new Date();
    const nowIso = now.toISOString();
    const currentMonthStart = getMonthBoundary(now, 0);
    const nextMonthStart = getMonthBoundary(now, 1);
    const previousMonthStart = getMonthBoundary(now, -1);
    const seriesMonthStart = getMonthBoundary(now, -11);

    const [calls, appointments, contacts, conversations, openVoiceFollowUpItems] = await Promise.all([
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
      ctx.db
        .query("inbox_items")
        .withIndex("by_business_id_and_kind_and_status", (q) =>
          q.eq("businessId", args.businessId).eq("kind", "voice_message").eq("status", "open"),
        )
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
    const messagesByConversationId = new Map<Id<"conversations">, Array<Doc<"messages">>>();
    for (const entry of messagesByConversation) {
      messagesByConversationId.set(entry.conversationId, entry.messages);
    }
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
    const averageDurationWindow = buildAverageWindow(
      calls.map((call) => ({
        timestamp: Date.parse(call.startedAt),
        durationSeconds: call.providerCallDurationSeconds,
      })),
      currentMonthStart,
      nextMonthStart,
      previousMonthStart,
    );
    const averageDurationSeconds = calculateAverageDurationSeconds(
      calls.map((call) => call.providerCallDurationSeconds),
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
          const visibleTranscriptPreview = transcriptPreview.find(
            (transcript) => !isTranscriptExpired(transcript),
          );

          return {
            id: call._id,
            startedAt: call.startedAt,
            status: call.status,
            disposition: call.disposition ?? null,
            durationSeconds: call.providerCallDurationSeconds ?? null,
            transcriptReady: visibleTranscriptPreview !== undefined,
            recordingAvailable:
              call.recordingStorageId !== undefined && !isCallRecordingExpired(call),
            contactName: contact?.name ?? null,
            contactPhone: contact?.phone ?? null,
          };
        }),
    );

    const nowMs = now.getTime();
    const liveCalls = calls.filter((call) => isCallLiveForDashboard(call, nowMs)).length;

    const actionRequiredFromVoice = dedupeVoiceFollowUpItems(
      openVoiceFollowUpItems.slice().sort((left, right) => right._creationTime - left._creationTime),
    )
      .slice(0, 6)
      .map((item) => ({
        id: String(item._id),
        kind: item.kind,
        title: getVisibleInboxItemTitle(item),
        body: getVisibleInboxItemBody(item),
        createdAt: new Date(item._creationTime).toISOString(),
        taskId: item._id,
        ...(item.relatedId ? { callId: item.relatedId as Id<"calls"> } : {}),
      }));

    const handoffConversations = conversations
      .filter(
        (conversation) =>
          conversation.status === "open" &&
          conversation.channel === "sms" &&
          conversation.automationState === "human_handoff",
      );

    const actionRequiredFromHandoffs = await Promise.all(
      handoffConversations.map(async (conversation) => {
        const contact = conversation.contactId ? await ctx.db.get(conversation.contactId) : null;
        const conversationMessages = messagesByConversationId.get(conversation._id) ?? [];
        const latestMessage = conversationMessages.reduce<Doc<"messages"> | null>(
          (latest, message) =>
            latest === null || message._creationTime > latest._creationTime ? message : latest,
          null,
        );
        const hasExpiredMessages = conversationMessages.some((message) =>
          isMessageContentExpired(message),
        );
        const latestMessageBody = latestMessage
          ? getVisibleMessageBody(latestMessage).trim()
          : "";
        const latestMessageTimestamp =
          latestMessage?._creationTime ??
          (conversation.automationPausedAt
            ? Date.parse(conversation.automationPausedAt)
            : conversation._creationTime);

        return {
          id: String(conversation._id),
          kind: "human_handoff",
          title: contact?.name ?? contact?.phone ?? "Human handoff",
          body:
            latestMessageBody ||
            (hasExpiredMessages ? "" : conversation.summary) ||
            "AI is paused and waiting for an operator reply.",
          createdAt:
            latestMessage !== null
              ? new Date(latestMessage._creationTime).toISOString()
              : conversation.automationPausedAt ?? new Date(conversation._creationTime).toISOString(),
          conversationId: conversation._id,
          _sortTimestamp: latestMessageTimestamp,
          _conversationCreatedAt: conversation._creationTime,
        };
      }),
    );
    actionRequiredFromHandoffs.sort(
      (left, right) =>
        right._sortTimestamp - left._sortTimestamp ||
        right._conversationCreatedAt - left._conversationCreatedAt,
    );

    const actionRequired = [...actionRequiredFromVoice, ...actionRequiredFromHandoffs]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 6)
      .map((item) => {
        if (!("conversationId" in item)) {
          return item;
        }

        const {
          _sortTimestamp: _unusedSortTimestamp,
          _conversationCreatedAt: _unusedConversationCreatedAt,
          ...cleanItem
        } = item;
        return cleanItem;
      });

    const upcomingAppointments = appointments
      .filter(
        (appointment) =>
          Date.parse(appointment.startsAt) >= now.getTime() &&
          appointment.status !== "cancelled" &&
          appointment.status !== "canceled",
      )
      .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
      .slice(0, 5);

    const upcoming = await Promise.all(
      upcomingAppointments.map(async (appointment) => {
        const [contact, service, staff] = await Promise.all([
          ctx.db.get(appointment.contactId),
          ctx.db.get(appointment.serviceId),
          ctx.db.get(appointment.staffId),
        ]);

        return {
          id: appointment._id,
          startsAt: appointment.startsAt,
          timezone: appointment.timezone,
          status: appointment.status,
          sourceChannel: appointment.sourceChannel,
          contactName: contact?.name ?? contact?.phone ?? null,
          serviceName: service ? getLocalizedServiceName(service, args.locale) : null,
          staffName: staff?.name ?? null,
        };
      }),
    );

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
        averageDuration: {
          totalSeconds: averageDurationSeconds,
          currentMonthSeconds: averageDurationWindow.current,
          previousMonthSeconds: averageDurationWindow.previous,
          deltaSeconds: averageDurationWindow.current - averageDurationWindow.previous,
        },
      },
      liveCalls,
      actionRequired,
      upcoming,
      monthlyCalls,
      recentCalls,
    };
  },
});

export const getAnalyticsSummary = query({
  args: {
    businessId: v.id("businesses"),
    granularity: v.optional(
      v.union(
        v.literal("hourly"),
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly"),
        v.literal("yearly"),
      ),
    ),
    rangeEndMs: v.optional(v.number()),
    rangeStartMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const now = new Date();
    const defaultRange = getDefaultAnalyticsRange(now);
    const rangeStart = args.rangeStartMs ?? defaultRange.start;
    const rangeEnd = args.rangeEndMs ?? defaultRange.end;
    const previousRangeStart = getPreviousRangeStart(rangeStart, rangeEnd);
    const granularity = args.granularity ?? "weekly";

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
      rangeStart,
      rangeEnd,
      previousRangeStart,
    );
    const messageWindow = buildKpiWindow(
      allMessages.map((message) => message._creationTime),
      rangeStart,
      rangeEnd,
      previousRangeStart,
    );
    const appointmentWindow = buildKpiWindow(
      appointments.map((appointment) => Date.parse(appointment.startsAt)),
      rangeStart,
      rangeEnd,
      previousRangeStart,
    );
    const agentResponseValues = buildAgentResponseValues(allMessages);
    const agentResponseWindow = buildAverageWindow(
      agentResponseValues,
      rangeStart,
      rangeEnd,
      previousRangeStart,
    );

    const callCountsByBucket = new Map<string, number>();
    const messageCountsByBucket = new Map<string, number>();
    const appointmentCountsByBucket = new Map<string, number>();
    const agentResponseSecondsByBucket = buildBucketAverageDurationMap(
      agentResponseValues.filter(
        (value) => value.timestamp >= rangeStart && value.timestamp < rangeEnd,
      ),
      granularity,
    );
    for (const call of calls) {
      const timestamp = Date.parse(call.startedAt);
      if (timestamp < rangeStart || timestamp >= rangeEnd) {
        continue;
      }
      incrementCount(
        callCountsByBucket,
        new Date(getBucketStart(timestamp, granularity)).toISOString(),
      );
    }

    for (const message of allMessages) {
      if (message._creationTime < rangeStart || message._creationTime >= rangeEnd) {
        continue;
      }
      incrementCount(
        messageCountsByBucket,
        new Date(getBucketStart(message._creationTime, granularity)).toISOString(),
      );
    }

    for (const appointment of appointments) {
      const timestamp = Date.parse(appointment.startsAt);
      if (timestamp < rangeStart || timestamp >= rangeEnd) {
        continue;
      }
      incrementCount(
        appointmentCountsByBucket,
        new Date(getBucketStart(timestamp, granularity)).toISOString(),
      );
    }

    const weeklySeries = buildBucketStarts(rangeStart, rangeEnd, granularity).map((bucketStart) => {
      const bucketKey = new Date(bucketStart).toISOString();
      return {
        dayStart: bucketKey,
        calls: callCountsByBucket.get(bucketKey) ?? 0,
        messages: messageCountsByBucket.get(bucketKey) ?? 0,
        appointments: appointmentCountsByBucket.get(bucketKey) ?? 0,
        agentResponseSeconds: agentResponseSecondsByBucket.get(bucketKey) ?? 0,
      };
    });

    const currentWeekCalls = calls.filter((call) => {
      const timestamp = Date.parse(call.startedAt);
      return timestamp >= rangeStart && timestamp < rangeEnd;
    });
    const currentWeekMessages = allMessages.filter(
      (message) => message._creationTime >= rangeStart && message._creationTime < rangeEnd,
    );

    const outcomes = {
      completed: 0,
      live: 0,
      missed: 0,
      transferred: 0,
    };
    for (const call of currentWeekCalls) {
      outcomes[categorizeCallOutcome(call)] += 1;
    }

    const conversationChannels = new Map(
      conversations.map((conversation) => [conversation._id, conversation.channel] as const),
    );
    const channels = {
      voice: 0,
      sms: 0,
      other: 0,
    };
    for (const call of currentWeekCalls) {
      const channel = call.conversationId
        ? conversationChannels.get(call.conversationId) ?? "voice"
        : "voice";
      channels[categorizeConversationChannel(channel)] += 1;
    }
    for (const message of currentWeekMessages) {
      channels[categorizeConversationChannel(message.channel)] += 1;
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
        averageAgentResponseSeconds: {
          value: agentResponseWindow.current,
          deltaSeconds: agentResponseWindow.current - agentResponseWindow.previous,
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
