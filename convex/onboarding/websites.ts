import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  action,
  internalMutation,
  mutation,
  type ActionCtx,
  type MutationCtx,
} from "../_generated/server";
import { requireMembership } from "../lib/auth";
import { workflowManager } from "../lib/components";
import {
  WEBSITE_CRAWL_DEPTH,
  WEBSITE_CRAWL_HTTP_MODE,
  WEBSITE_CRAWL_PAGE_LIMIT,
  WEBSITE_INGESTION_PROVIDER,
} from "../lib/websiteIngestion";

type BusinessIdArgs = {
  businessId: Id<"businesses">;
};

type SubmitOnboardingWebsiteResult = {
  status: "submitted";
  websiteUrl: string;
  websiteIngestionJobId: Id<"website_ingestion_jobs">;
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

async function assertOnboardingWebsiteAccess(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }

  const authUserId = await getAuthUserId(ctx);
  await ctx.runQuery(internal.businesses.catalog.assertCatalogWriteAccess, {
    businessId,
    authSubject: identity.subject,
    ...(authUserId ? { authUserId: String(authUserId) } : {}),
  });
}

async function requireBusinessInWebsiteStageForAction(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const business = await ctx.runQuery(internal.businesses.admin.getBusinessById, {
    businessId,
  });
  if (!business) {
    throw new Error("Business not found.");
  }

  if (business.onboardingStage !== "website") {
    throw new Error("Website onboarding is no longer available for this business.");
  }
}

export const submitOnboardingWebsiteAfterPreflight = internalMutation({
  args: {
    businessId: v.id("businesses"),
    websiteUrl: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<SubmitOnboardingWebsiteResult> => {
    await requireBusinessInWebsiteStage(ctx, args.businessId);

    const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
      businessId: args.businessId,
      websiteUrl: args.websiteUrl,
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
      websiteUrl: args.websiteUrl,
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
      websiteUrl: args.websiteUrl,
      websiteIngestionJobId,
    };
  },
});

export const submitOnboardingWebsite = action({
  args: {
    businessId: v.id("businesses"),
    websiteUrl: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<SubmitOnboardingWebsiteResult> => {
    await assertOnboardingWebsiteAccess(ctx, args.businessId);
    await requireBusinessInWebsiteStageForAction(ctx, args.businessId);

    const websiteUrl: string = await ctx.runAction(
      internal.ai.context.websiteIngestionActions.preflightWebsiteCrawlTarget,
      {
        websiteUrl: args.websiteUrl,
      },
    );

    return await ctx.runMutation(
      internal.onboarding.websites.submitOnboardingWebsiteAfterPreflight,
      {
        businessId: args.businessId,
        websiteUrl,
      },
    );
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
