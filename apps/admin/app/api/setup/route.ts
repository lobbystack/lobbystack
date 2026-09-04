import { and, count, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { agentRules, businesses, calendarConnections, knowledgeDocuments, services } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const business = await tx.select({ name: businesses.name, websiteUrl: businesses.websiteUrl, timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      const knowledge = await tx.select({ count: count() }).from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, businessId));
      const websiteKnowledge = await tx.select({ count: count() }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.sourceType, "website")));
      const calendar = await tx.select({ count: count() }).from(calendarConnections).where(and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected")));
      const serviceCount = await tx.select({ count: count() }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true)));
      const ruleCount = await tx.select({ count: count() }).from(agentRules).where(and(eq(agentRules.businessId, businessId), eq(agentRules.active, true)));
      const row = business[0];
      return {
        steps: [
          { id: "website", name: "Add your website", description: "Import your public website", status: Number(websiteKnowledge[0]?.count ?? 0) > 0 || Boolean(row?.websiteUrl) ? "complete" : "needs setup" },
          { id: "sources", name: "Add more sources", description: "Upload policies, FAQs, or pricing", status: Number(knowledge[0]?.count ?? 0) > Number(websiteKnowledge[0]?.count ?? 0) ? "complete" : "needs setup" },
          { id: "calendar", name: "Connect your calendar", description: "Keep appointment times in sync", status: Number(calendar[0]?.count ?? 0) > 0 ? "complete" : "needs setup" },
          { id: "services", name: "Add your services", description: "Configure services customers can book", status: Number(serviceCount[0]?.count ?? 0) > 0 ? "complete" : "needs setup" },
          { id: "rules", name: "Define rules", description: "Set receptionist instructions", status: Number(ruleCount[0]?.count ?? 0) > 0 ? "complete" : "needs setup" },
        ],
      };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
