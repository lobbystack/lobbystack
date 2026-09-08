import { and, count, eq, isNotNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { agentRules, businesses, calendarConnections, knowledgeDocuments, services } from "@lobbystack/db";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const business = await tx.select({ name: businesses.name, websiteUrl: businesses.websiteUrl, timezone: businesses.timezone, skippedSteps: businesses.setupGuideSkippedSteps }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      const knowledge = await tx.select({ count: count() }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.sourceType, "upload"), ne(knowledgeDocuments.status, "error"), ne(knowledgeDocuments.status, "cancelled")));
      const calendar = await tx.select({ count: count() }).from(calendarConnections).where(and(eq(calendarConnections.businessId, businessId), eq(calendarConnections.status, "connected"), isNotNull(calendarConnections.selectedCalendarId), ne(calendarConnections.selectedCalendarId, "")));
      const serviceCount = await tx.select({ count: count() }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true)));
      const ruleCount = await tx.select({ count: count() }).from(agentRules).where(and(eq(agentRules.businessId, businessId), eq(agentRules.active, true)));
      const row = business[0];
      return {
        steps: [
          { id: "website", name: "Add your website", description: "Import your public website", status: Boolean(row?.websiteUrl) ? "complete" : row?.skippedSteps.includes("website") ? "skipped" : "needs setup" },
          { id: "sources", name: "Add more sources", description: "Upload policies, FAQs, or pricing", status: Number(knowledge[0]?.count ?? 0) > 0 ? "complete" : row?.skippedSteps.includes("sources") ? "skipped" : "needs setup" },
          { id: "calendar", name: "Connect your calendar", description: "Keep appointment times in sync", status: Number(calendar[0]?.count ?? 0) > 0 ? "complete" : row?.skippedSteps.includes("calendar") ? "skipped" : "needs setup" },
          { id: "services", name: "Add your services", description: "Configure services customers can book", status: Number(serviceCount[0]?.count ?? 0) > 0 ? "complete" : row?.skippedSteps.includes("services") ? "skipped" : "needs setup" },
          { id: "rules", name: "Define rules", description: "Set receptionist instructions", status: Number(ruleCount[0]?.count ?? 0) > 0 ? "complete" : row?.skippedSteps.includes("rules") ? "skipped" : "needs setup" },
        ],
      };
    }, { minimumRole: "business_admin" }));
  } catch (error) {
    return asApiResponse(error);
  }
}

const stepIds = ["website", "sources", "calendar", "services", "rules"] as const;

export async function PATCH(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const body = await readJson(request) as { stepId?: string; skipped?: boolean };
      if (!body || !stepIds.includes(body.stepId as (typeof stepIds)[number]) || typeof body.skipped !== "boolean") throw jsonError("A valid stepId and skipped flag are required.");
      const current = (await tx.select({ skippedSteps: businesses.setupGuideSkippedSteps }).from(businesses).where(eq(businesses.id, businessId)).limit(1).for("update"))[0];
      if (!current) throw jsonError("Business not found.", 404);
      const skippedSteps = body.skipped ? Array.from(new Set([...current.skippedSteps, body.stepId!])) : current.skippedSteps.filter((id) => id !== body.stepId);
      await tx.update(businesses).set({ setupGuideSkippedSteps: skippedSteps, updatedAt: new Date() }).where(eq(businesses.id, businessId));
      return { skippedSteps };
    }, { minimumRole: "business_admin" }));
  } catch (error) {
    return asApiResponse(error);
  }
}
