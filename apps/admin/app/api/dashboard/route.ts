import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { appointments, calls, conversations, messages } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const [callCount, appointmentCount, messageCount, openConversationCount] = await Promise.all([
        tx.select({ count: count() }).from(calls).where(eq(calls.businessId, businessId)),
        tx.select({ count: count() }).from(appointments).where(eq(appointments.businessId, businessId)),
        tx.select({ count: count() }).from(messages).where(eq(messages.businessId, businessId)),
        tx.select({ count: count() }).from(conversations).where(eq(conversations.businessId, businessId)),
      ]);
      return { calls: Number(callCount[0]?.count ?? 0), appointments: Number(appointmentCount[0]?.count ?? 0), messages: Number(messageCount[0]?.count ?? 0), openConversations: Number(openConversationCount[0]?.count ?? 0) };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
