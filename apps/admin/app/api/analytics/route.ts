import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { appointments, calls, messages } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const now = new Date();
      const currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
      const previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60_000);
      const [currentCalls, previousCalls, currentAppointments, previousAppointments, currentMessages, previousMessages, duration] = await Promise.all([
        tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, businessId), gte(calls.startedAt, currentStart))),
        tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, businessId), gte(calls.startedAt, previousStart), lt(calls.startedAt, currentStart))),
        tx.select({ count: count() }).from(appointments).where(and(eq(appointments.businessId, businessId), gte(appointments.startsAt, currentStart))),
        tx.select({ count: count() }).from(appointments).where(and(eq(appointments.businessId, businessId), gte(appointments.startsAt, previousStart), lt(appointments.startsAt, currentStart))),
        tx.select({ count: count() }).from(messages).where(and(eq(messages.businessId, businessId), gte(messages.createdAt, currentStart))),
        tx.select({ count: count() }).from(messages).where(and(eq(messages.businessId, businessId), gte(messages.createdAt, previousStart), lt(messages.createdAt, currentStart))),
        tx.select({ averageSeconds: sql<number>`coalesce(avg(${calls.providerDurationSeconds}), 0)` }).from(calls).where(and(eq(calls.businessId, businessId), gte(calls.startedAt, currentStart))),
      ]);
      return {
        periodDays: 30,
        calls: { current: Number(currentCalls[0]?.count ?? 0), previous: Number(previousCalls[0]?.count ?? 0) },
        appointments: { current: Number(currentAppointments[0]?.count ?? 0), previous: Number(previousAppointments[0]?.count ?? 0) },
        messages: { current: Number(currentMessages[0]?.count ?? 0), previous: Number(previousMessages[0]?.count ?? 0) },
        averageCallDurationSeconds: Number(duration[0]?.averageSeconds ?? 0),
      };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
