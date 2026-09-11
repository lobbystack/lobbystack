import { and, count, desc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  dashboardAggregatesQuery,
  type DashboardAggregates,
  appointments,
  calls,
  contacts,
  conversations,
  services,
  staff,
} from "@lobbystack/db";
import { listOpenVoiceFollowUps } from "@lobbystack/domain";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Percent change between two reporting periods, matching the previous dashboard math. */
function percentageDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

/** Duration used by the recent-call list; mirrors the SQL duration expression below. */
function durationSeconds(call: { providerDurationSeconds: number | null; startedAt: Date; endedAt: Date | null }): number {
  if (call.providerDurationSeconds !== null) return call.providerDurationSeconds;
  if (!call.endedAt) return 0;
  return Math.max(0, Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1_000));
}

/** First day of the month in UTC, formatted like the SQL month buckets. */
function utcMonthKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}


export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const now = new Date();
      const currentStart = new Date(now.getTime() - 30 * DAY_MS);
      const previousStart = new Date(now.getTime() - 60 * DAY_MS);
      const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

      const aggregateResult = await tx.execute(dashboardAggregatesQuery({ businessId, currentStart, previousStart, chartStart }));
      const [aggregates] = aggregateResult.rows as unknown as [DashboardAggregates];
      const recentCalls = await tx.select({ id: calls.id, startedAt: calls.startedAt, status: calls.status, providerDurationSeconds: calls.providerDurationSeconds, endedAt: calls.endedAt, contactName: contacts.name, contactPhone: contacts.phone }).from(calls).leftJoin(contacts, eq(calls.contactId, contacts.id)).where(eq(calls.businessId, businessId)).orderBy(desc(calls.startedAt)).limit(5);
      const upcoming = await tx.select({ id: appointments.id, startsAt: appointments.startsAt, timezone: appointments.timezone, status: appointments.status, sourceChannel: appointments.sourceChannel, contactName: contacts.name, serviceName: services.name, staffName: staff.name }).from(appointments).leftJoin(contacts, eq(appointments.contactId, contacts.id)).leftJoin(services, eq(appointments.serviceId, services.id)).leftJoin(staff, eq(appointments.staffId, staff.id)).where(and(eq(appointments.businessId, businessId), gte(appointments.startsAt, now))).orderBy(appointments.startsAt).limit(5);
      const liveCallCount = await tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, businessId), eq(calls.status, "started")));
      const handoffConversations = await tx.select({ id: conversations.id, contactName: contacts.name, summary: conversations.summary, currentIntent: conversations.currentIntent, updatedAt: conversations.updatedAt }).from(conversations).leftJoin(contacts, eq(conversations.contactId, contacts.id)).where(and(eq(conversations.businessId, businessId), eq(conversations.automationState, "human_handoff"))).orderBy(desc(conversations.updatedAt)).limit(6);
      const voiceFollowUps = await listOpenVoiceFollowUps(tx, businessId);

      const monthlyTotals = new Map((aggregates?.monthlyCalls ?? []).map((bucket) => [bucket.month, bucket.total]));
      const monthlyCalls = Array.from({ length: 12 }, (_, index) => {
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
        return {
          monthStart: monthStart.toISOString(),
          total: monthlyTotals.get(utcMonthKey(monthStart)) ?? 0,
        };
      });

      const currentCallsTotal = aggregates?.callsCurrent ?? 0;
      const previousCallsTotal = aggregates?.callsPrevious ?? 0;
      const currentDuration = aggregates?.averageDurationCurrent ?? 0;
      const previousDuration = aggregates?.averageDurationPrevious ?? 0;

      return {
        businessId,
        kpis: {
          calls: { total: currentCallsTotal, deltaPercent: percentageDelta(currentCallsTotal, previousCallsTotal) },
          messages: { total: aggregates?.messagesCurrent ?? 0, deltaPercent: percentageDelta(aggregates?.messagesCurrent ?? 0, aggregates?.messagesPrevious ?? 0) },
          appointments: { total: aggregates?.appointmentsCurrent ?? 0, deltaPercent: percentageDelta(aggregates?.appointmentsCurrent ?? 0, aggregates?.appointmentsPrevious ?? 0) },
          averageDuration: { totalSeconds: currentDuration, deltaSeconds: currentDuration - previousDuration },
        },
        liveCalls: Number(liveCallCount[0]?.count ?? 0),
        monthlyCalls,
        recentCalls: recentCalls.map((call) => ({
          id: call.id,
          startedAt: call.startedAt.toISOString(),
          status: call.status,
          durationSeconds: durationSeconds(call),
          contactName: call.contactName,
          contactPhone: call.contactPhone,
        })),
        actionRequired: [...voiceFollowUps.map((item) => ({
          id: item.id,
          kind: "voice_message",
          title: item.title,
          body: item.body,
          createdAt: item.createdAt.toISOString(),
          callId: item.relatedCallId,
        })), ...handoffConversations.map((conversation) => ({
          id: conversation.id,
          kind: "human_handoff",
          title: conversation.contactName ?? "Human follow-up requested",
          body: conversation.summary ?? conversation.currentIntent ?? "A customer conversation needs an operator response.",
          createdAt: conversation.updatedAt.toISOString(),
          conversationId: conversation.id,
        }))].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, 6),
        upcoming: upcoming.map((appointment) => ({
          ...appointment,
          startsAt: appointment.startsAt.toISOString(),
        })),
      };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
