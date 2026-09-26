import { and, count, eq, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, knowledgeDocuments, phoneNumbers } from "@lobbystack/db";
import { countOperatorTestCallsHeard, currentWebsiteIngestion, ONBOARDING_CRAWL_PAGE_LIMIT } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const business = await tx.select({ name: businesses.name, websiteUrl: businesses.websiteUrl, timezone: businesses.timezone, skippedSteps: businesses.setupGuideSkippedSteps }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      const knowledge = await tx.select({ count: count() }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.sourceType, "upload"), ne(knowledgeDocuments.status, "error"), ne(knowledgeDocuments.status, "cancelled")));
      const sampled = await currentWebsiteIngestion(tx, businessId);
      // Onboarding samples a site, and an expansion reuses the same row, so the
      // page count cannot say which kind of crawl produced it; the cap it ran
      // with can. The step is done once the site has been read in full: with no
      // crawl at all, or a completed one that was not cut off by the sample cap.
      // A crawl still running or one that failed leaves the step open, so the
      // count never goes backwards and a failed read keeps its way back in.
      const fullyRead = !sampled?.rootDocumentId || (sampled.status === "completed" && !(sampled.pageLimit === ONBOARDING_CRAWL_PAGE_LIMIT && sampled.importedCount >= ONBOARDING_CRAWL_PAGE_LIMIT));
      const heardCalls = await countOperatorTestCallsHeard(tx, businessId);
      const businessNumber = await tx.select({ count: count() }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.reclaimScheduledAt)));
      const row = business[0];
      return {
        steps: [
          { id: "fullScan", name: "Read the rest of your site", description: "Onboarding read a sample", documentId: sampled?.rootDocumentId ?? null, status: fullyRead ? "complete" : row?.skippedSteps.includes("fullScan") ? "skipped" : "needs setup" },
          { id: "sources", name: "Add more sources", description: "Upload policies, FAQs, or pricing", status: Number(knowledge[0]?.count ?? 0) > 0 ? "complete" : row?.skippedSteps.includes("sources") ? "skipped" : "needs setup" },
          { id: "testCall", name: "Hear your agent", description: "Call it from your browser", status: heardCalls > 0 ? "complete" : row?.skippedSteps.includes("testCall") ? "skipped" : "needs setup" },
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
