import { and, count, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { billingAccounts, calendarConnections, phoneNumbers } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const [calendar, billing, phones] = await Promise.all([
        tx.select({ provider: calendarConnections.provider, account: calendarConnections.externalAccountId, status: calendarConnections.status, updatedAt: calendarConnections.updatedAt }).from(calendarConnections).where(and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected"))).orderBy(calendarConnections.updatedAt),
        tx.select({ plan: billingAccounts.plan, state: billingAccounts.subscriptionState, updatedAt: billingAccounts.updatedAt }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1),
        tx.select({ count: count() }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"))),
      ]);
      return {
        integrations: [
          ...(calendar[0] ? [{ name: calendar[0].provider === "google" ? "Google Calendar" : calendar[0].provider, account: calendar[0].account, status: calendar[0].status, updatedAt: calendar[0].updatedAt }] : [{ name: "Google Calendar", account: "Not connected", status: "disconnected", updatedAt: null }]),
          { name: "Twilio", account: `${Number(phones[0]?.count ?? 0)} active phone number${Number(phones[0]?.count ?? 0) === 1 ? "" : "s"}`, status: Number(phones[0]?.count ?? 0) > 0 ? "connected" : "disconnected", updatedAt: null },
          { name: "Polar billing", account: billing[0]?.plan ?? "Not configured", status: billing[0]?.state ?? "disconnected", updatedAt: billing[0]?.updatedAt ?? null },
        ],
      };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
