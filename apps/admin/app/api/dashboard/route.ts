import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  appointments,
  calls,
  contacts,
  conversations,
  messages,
  services,
  staff,
} from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

function percentageDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function durationSeconds(call: { providerDurationSeconds: number | null; startedAt: Date; endedAt: Date | null }): number {
  if (call.providerDurationSeconds !== null) return call.providerDurationSeconds;
  if (!call.endedAt) return 0;
  return Math.max(0, Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1_000));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const now = new Date();
      const currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
      const previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1_000);
      const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

      const currentCallCount = await tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, businessId), gte(calls.startedAt, currentStart)));
      const previousCallCount = await tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, businessId), gte(calls.startedAt, previousStart), lt(calls.startedAt, currentStart)));
      const currentAppointmentCount = await tx.select({ count: count() }).from(appointments).where(and(eq(appointments.businessId, businessId), gte(appointments.createdAt, currentStart)));
      const previousAppointmentCount = await tx.select({ count: count() }).from(appointments).where(and(eq(appointments.businessId, businessId), gte(appointments.createdAt, previousStart), lt(appointments.createdAt, currentStart)));
      const currentMessageCount = await tx.select({ count: count() }).from(messages).where(and(eq(messages.businessId, businessId), gte(messages.createdAt, currentStart)));
      const previousMessageCount = await tx.select({ count: count() }).from(messages).where(and(eq(messages.businessId, businessId), gte(messages.createdAt, previousStart), lt(messages.createdAt, currentStart)));
      const currentCalls = await tx.select({ providerDurationSeconds: calls.providerDurationSeconds, startedAt: calls.startedAt, endedAt: calls.endedAt }).from(calls).where(and(eq(calls.businessId, businessId), gte(calls.startedAt, currentStart)));
      const previousCalls = await tx.select({ providerDurationSeconds: calls.providerDurationSeconds, startedAt: calls.startedAt, endedAt: calls.endedAt }).from(calls).where(and(eq(calls.businessId, businessId), gte(calls.startedAt, previousStart), lt(calls.startedAt, currentStart)));
      const recentCalls = await tx.select({ id: calls.id, startedAt: calls.startedAt, status: calls.status, providerDurationSeconds: calls.providerDurationSeconds, endedAt: calls.endedAt, contactName: contacts.name, contactPhone: contacts.phone }).from(calls).leftJoin(contacts, eq(calls.contactId, contacts.id)).where(eq(calls.businessId, businessId)).orderBy(desc(calls.startedAt)).limit(5);
      const upcoming = await tx.select({ id: appointments.id, startsAt: appointments.startsAt, timezone: appointments.timezone, status: appointments.status, sourceChannel: appointments.sourceChannel, contactName: contacts.name, serviceName: services.name, staffName: staff.name }).from(appointments).leftJoin(contacts, eq(appointments.contactId, contacts.id)).leftJoin(services, eq(appointments.serviceId, services.id)).leftJoin(staff, eq(appointments.staffId, staff.id)).where(and(eq(appointments.businessId, businessId), gte(appointments.startsAt, now))).orderBy(appointments.startsAt).limit(5);
      const chartCalls = await tx.select({ startedAt: calls.startedAt }).from(calls).where(and(eq(calls.businessId, businessId), gte(calls.startedAt, chartStart)));
      const liveCallCount = await tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, businessId), eq(calls.status, "started")));
      const handoffConversations = await tx.select({ id: conversations.id, contactName: contacts.name, summary: conversations.summary, currentIntent: conversations.currentIntent, updatedAt: conversations.updatedAt }).from(conversations).leftJoin(contacts, eq(conversations.contactId, contacts.id)).where(and(eq(conversations.businessId, businessId), eq(conversations.automationState, "human_handoff"))).orderBy(desc(conversations.updatedAt)).limit(6);

      const currentCallsTotal = Number(currentCallCount[0]?.count ?? 0);
      const previousCallsTotal = Number(previousCallCount[0]?.count ?? 0);
      const currentAppointmentsTotal = Number(currentAppointmentCount[0]?.count ?? 0);
      const previousAppointmentsTotal = Number(previousAppointmentCount[0]?.count ?? 0);
      const currentMessagesTotal = Number(currentMessageCount[0]?.count ?? 0);
      const previousMessagesTotal = Number(previousMessageCount[0]?.count ?? 0);
      const currentDuration = average(currentCalls.map(durationSeconds));
      const previousDuration = average(previousCalls.map(durationSeconds));
      const monthlyCalls = Array.from({ length: 6 }, (_, index) => {
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
        const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
        return {
          monthStart: monthStart.toISOString(),
          total: chartCalls.filter((call) => call.startedAt >= monthStart && call.startedAt < nextMonth).length,
        };
      });

      return {
        businessId,
        kpis: {
          calls: { total: currentCallsTotal, deltaPercent: percentageDelta(currentCallsTotal, previousCallsTotal) },
          messages: { total: currentMessagesTotal, deltaPercent: percentageDelta(currentMessagesTotal, previousMessagesTotal) },
          appointments: { total: currentAppointmentsTotal, deltaPercent: percentageDelta(currentAppointmentsTotal, previousAppointmentsTotal) },
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
        actionRequired: handoffConversations.map((conversation) => ({
          id: conversation.id,
          kind: "human_handoff",
          title: conversation.contactName ?? "Human follow-up requested",
          body: conversation.summary ?? conversation.currentIntent ?? "A customer conversation needs an operator response.",
          createdAt: conversation.updatedAt.toISOString(),
          conversationId: conversation.id,
        })),
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
