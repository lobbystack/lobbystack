import { and, asc, count, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, calls, knowledgeDocuments, phoneNumbers, websiteIngestionJobs } from "@lobbystack/db";
import { ONBOARDING_CRAWL_PAGE_LIMIT } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const business = await tx.select({ name: businesses.name, websiteUrl: businesses.websiteUrl, timezone: businesses.timezone, skippedSteps: businesses.setupGuideSkippedSteps }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      const knowledge = await tx.select({ count: count() }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.sourceType, "upload"), ne(knowledgeDocuments.status, "error"), ne(knowledgeDocuments.status, "cancelled")));
      // A call that carried media and ended is a call the operator actually heard.
      // Onboarding samples a site. A completed import that stopped exactly on the
      // sample limit is the one case where there is more of the site left to read.
      const sampled = (await tx.select({ rootDocumentId: websiteIngestionJobs.rootDocumentId, status: websiteIngestionJobs.status, importedCount: websiteIngestionJobs.importedCount }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.businessId, businessId)).orderBy(asc(websiteIngestionJobs.createdAt)).limit(1))[0];
      const moreToRead = Boolean(sampled?.rootDocumentId && sampled.status === "completed" && sampled.importedCount >= ONBOARDING_CRAWL_PAGE_LIMIT);
      const heardCall = await tx.select({ count: count() }).from(calls).where(and(eq(calls.businessId, businessId), eq(calls.transport, "web_voice"), isNull(calls.prospectDemoId), isNotNull(calls.mediaStartedAt), isNotNull(calls.endedAt)));
      const businessNumber = await tx.select({ count: count() }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt)));
      const row = business[0];
      return {
        steps: [
          { id: "fullScan", name: "Read the rest of your site", description: "Onboarding read a sample", documentId: sampled?.rootDocumentId ?? null, status: !moreToRead ? "complete" : row?.skippedSteps.includes("fullScan") ? "skipped" : "needs setup" },
          { id: "sources", name: "Add more sources", description: "Upload policies, FAQs, or pricing", status: Number(knowledge[0]?.count ?? 0) > 0 ? "complete" : row?.skippedSteps.includes("sources") ? "skipped" : "needs setup" },
          { id: "testCall", name: "Hear your agent", description: "Call it from your browser", status: Number(heardCall[0]?.count ?? 0) > 0 ? "complete" : row?.skippedSteps.includes("testCall") ? "skipped" : "needs setup" },
          { id: "phoneNumber", name: "Connect a phone number", description: "Let it answer real callers", status: Number(businessNumber[0]?.count ?? 0) > 0 ? "complete" : row?.skippedSteps.includes("phoneNumber") ? "skipped" : "needs setup" },
        ],
      };
    }, { minimumRole: "business_admin" }));
  } catch (error) {
    return asApiResponse(error);
  }
}

const stepIds = ["fullScan", "sources", "testCall", "phoneNumber"] as const;

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
