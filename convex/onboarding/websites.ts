import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { mutation, type MutationCtx } from "../_generated/server";
import { requireMembership } from "../lib/auth";
import { workflowManager } from "../lib/components";
import {
  normalizeWebsiteUrl,
  WEBSITE_CRAWL_DEPTH,
  WEBSITE_CRAWL_HTTP_MODE,
  WEBSITE_CRAWL_PAGE_LIMIT,
  WEBSITE_INGESTION_PROVIDER,
} from "../lib/websiteIngestion";

type BusinessIdArgs = {
  businessId: Id<"businesses">;
};

async function requireBusinessInWebsiteStage(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found.");
  }

  if (business.onboardingStage !== "website") {
    throw new Error("Website onboarding is no longer available for this business.");
  }
}

export const submitOnboardingWebsite = mutation({
  args: {
    businessId: v.id("businesses"),
    websiteUrl: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "submitted";
    websiteUrl: string;
    websiteIngestionJobId: Id<"website_ingestion_jobs">;
  }> => {
    await requireMembership(ctx, args.businessId);
    await requireBusinessInWebsiteStage(ctx, args.businessId);

    const websiteUrl = normalizeWebsiteUrl(args.websiteUrl);
    const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
      businessId: args.businessId,
      websiteUrl,
      provider: WEBSITE_INGESTION_PROVIDER,
      status: "queued",
      crawlMode: WEBSITE_CRAWL_HTTP_MODE,
      fallbackTriggered: false,
      pageLimit: WEBSITE_CRAWL_PAGE_LIMIT,
      depth: WEBSITE_CRAWL_DEPTH,
      importedCount: 0,
      indexedCount: 0,
      errorCount: 0,
    });

    await ctx.db.patch(args.businessId, {
      websiteUrl,
      onboardingStage: "phone_number",
    });

    await workflowManager.start(
      ctx,
      internal.ai.workflows.runtime.importWebsiteKnowledgeWorkflow,
      {
        websiteIngestionJobId,
      },
    );

    return {
      status: "submitted",
      websiteUrl,
      websiteIngestionJobId,
    };
  },
});

export const skipOnboardingWebsite = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args: BusinessIdArgs): Promise<{ status: "skipped" }> => {
    await requireMembership(ctx, args.businessId);
    await requireBusinessInWebsiteStage(ctx, args.businessId);

    await ctx.db.patch(args.businessId, {
      onboardingStage: "phone_number",
    });

    return { status: "skipped" };
  },
});
