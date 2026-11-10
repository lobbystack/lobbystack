import { and, count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  dashboardAggregatesQuery,
  type DashboardAggregates,
  calls,
  contacts,
  conversations,
} from "@lobbystack/db";
import { countOpenVoiceFollowUps, listOpenVoiceFollowUps, readAnalyticsResults, listRecentCalls, listUpcomingAppointments, readFirstRealConversationAt } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1_000;
/** How many open requests Home lists. */
const ACTION_REQUIRED_SHOWN = 6;

/** Duration used by the recent-call list; mirrors the average call duration on Analytics. */
function durationSeconds(call: { providerDurationSeconds: number | null; startedAt: Date; endedAt: Date | null }): number {
  if (call.providerDurationSeconds !== null) return call.providerDurationSeconds;
  if (!call.endedAt) return 0;
  return Math.max(0, Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1_000));
}

/** First day of the month in UTC, formatted like the SQL month buckets. */
function utcMonthKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}


export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const now = new Date();
  const currentStart = new Date(now.getTime() - 30 * DAY_MS);
  const previousStart = new Date(now.getTime() - 60 * DAY_MS);
  const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const aggregateResult = await tx.execute(dashboardAggregatesQuery({ businessId, chartStart }));
  const [aggregates] = aggregateResult.rows as unknown as [DashboardAggregates];
  // Home's results cover the last 30 days, compared with the 30 days before.
  const results = await readAnalyticsResults(tx, { businessId, from: currentStart, to: now, previousFrom: previousStart });
  const recentCalls = await listRecentCalls(tx, businessId);
  const upcoming = await listUpcomingAppointments(tx, businessId, now);
  const liveCallCount = await tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, businessId), eq(calls.status, "started")));
  const handoffConversations = await tx.select({ id: conversations.id, contactName: contacts.name, summary: conversations.summary, currentIntent: conversations.currentIntent, updatedAt: conversations.updatedAt }).from(conversations).leftJoin(contacts, eq(conversations.contactId, contacts.id)).where(and(eq(conversations.businessId, businessId), eq(conversations.automationState, "human_handoff"))).orderBy(desc(conversations.updatedAt)).limit(6);
  const voiceFollowUps = await listOpenVoiceFollowUps(tx, businessId);
  // Home lists a few of these; the count says how many are open in all.
  const openFollowUps = await countOpenVoiceFollowUps(tx, businessId);
  const [openHandoffs] = await tx.select({ count: count() }).from(conversations).where(and(eq(conversations.businessId, businessId), eq(conversations.automationState, "human_handoff")));
  const firstRealConversationAt = await readFirstRealConversationAt(tx, businessId);

  const monthlyTotals = new Map((aggregates?.monthlyCalls ?? []).map((bucket) => [bucket.month, bucket.total]));
  const monthlyCalls = Array.from({ length: 12 }, (_, index) => {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
    return {
      monthStart: monthStart.toISOString(),
      total: monthlyTotals.get(utcMonthKey(monthStart)) ?? 0,
    };
  });

  return {
    businessId,
    firstRealConversationAt,
    results,
    liveCalls: Number(liveCallCount[0]?.count ?? 0),
    monthlyCalls,
    recentCalls: recentCalls.map((call) => ({
      id: call.id,
      startedAt: call.startedAt.toISOString(),
      status: call.status,
      transport: call.transport,
      durationSeconds: durationSeconds(call),
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      contactEmail: call.contactEmail,
    })),
    actionRequired: [...voiceFollowUps.map((item) => ({
      id: item.id,
      kind: "voice_message",
      title: item.title,
      body: item.body,
      createdAt: item.createdAt.toISOString(),
      callId: item.relatedCallId,
      request: item.request,
      requested: item.requested,
      appointment: item.appointment ? { ...item.appointment, startsAt: item.appointment.startsAt.toISOString() } : null,
    })), ...handoffConversations.map((conversation) => ({
      id: conversation.id,
      kind: "human_handoff",
      title: conversation.contactName ?? "Human follow-up requested",
      body: conversation.summary ?? conversation.currentIntent ?? "A customer conversation needs an operator response.",
      createdAt: conversation.updatedAt.toISOString(),
      conversationId: conversation.id,
    }))].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, ACTION_REQUIRED_SHOWN),
    actionRequiredCount: openFollowUps + Number(openHandoffs?.count ?? 0),
    upcoming: upcoming.map((appointment) => ({
      ...appointment,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
    })),
  };
})));
