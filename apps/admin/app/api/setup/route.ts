import { and, count, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { agentRules, businesses, calendarConnections, knowledgeDocuments, services } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const [business, knowledge, calendar, serviceCount, ruleCount] = await Promise.all([
        tx.select({ name: businesses.name, websiteUrl: businesses.websiteUrl, timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
        tx.select({ count: count() }).from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, businessId)),
        tx.select({ count: count() }).from(calendarConnections).where(and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected"))),
        tx.select({ count: count() }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true))),
        tx.select({ count: count() }).from(agentRules).where(and(eq(agentRules.businessId, businessId), eq(agentRules.active, true))),
      ]);
      const row = business[0];
      return {
        steps: [
          { name: "Business details", description: "Name, timezone, and locale", status: row?.name && row.timezone ? "complete" : "needs setup" },
          { name: "Knowledge", description: "Website and documents", status: Number(knowledge[0]?.count ?? 0) > 0 ? "complete" : "needs setup" },
          { name: "Calendar", description: "Connect a calendar", status: Number(calendar[0]?.count ?? 0) > 0 ? "complete" : "needs setup" },
          { name: "Services", description: "Add durations and staff", status: Number(serviceCount[0]?.count ?? 0) > 0 ? "complete" : "needs setup" },
          { name: "Rules", description: "Define receptionist behavior", status: Number(ruleCount[0]?.count ?? 0) > 0 ? "complete" : "needs setup" },
        ],
      };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
