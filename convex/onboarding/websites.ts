import {
  getAuthUserId } from "@convex-dev/auth/server";
import { observedInternalMutation as internalMutation, observedMutation as mutation } from "../telemetry/observedFunctions";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { type ActionCtx, type MutationCtx } from "../_generated/server";
import { requireTenantAdminMembership } from "../lib/auth";
import { ONBOARDING_STAGE_INDEX, normalizeOnboardingStage } from "../lib/onboardingStage";

import { observedAction as action } from "../telemetry/observedFunctions";
type BusinessIdArgs = {
  businessId: Id<"businesses">;
};

type SubmitOnboardingWebsiteResult = {
  status: "submitted";
  websiteUrl: string;
  websiteIngestionJobId: Id<"website_ingestion_jobs">;
};

const MAX_REUSABLE_WEBSITE_JOBS_TO_CHECK = 10;
const MAX_REUSABLE_WEBSITE_DOCUMENTS_TO_CHECK = 100;

function isUsableWebsiteKnowledgeDocument(
  document: Doc<"knowledge_documents">,
): boolean {
  return (
    document.active !== false &&
    document.status === "indexed" &&
    Boolean(document.textContent?.trim())
  );
}

async function findReusableCompletedWebsiteIngestionJob(
  ctx: MutationCtx,
  args: {
    businessId: Id<"businesses">;
    websiteUrl: string;
  },
): Promise<Doc<"website_ingestion_jobs"> | null> {
  const recentJobs = await ctx.db
    .query("website_ingestion_jobs")
    .withIndex("by_business_id_and_website_url", (q) =>
      q.eq("businessId", args.businessId).eq("websiteUrl", args.websiteUrl),
    )
    .order("desc")
    .take(MAX_REUSABLE_WEBSITE_JOBS_TO_CHECK);

  for (const job of recentJobs) {
    if (job.status !== "completed") {
      continue;
    }

    const documents = await ctx.db
      .query("knowledge_documents")
      .withIndex("by_website_ingestion_job_id", (q) =>
        q.eq("websiteIngestionJobId", job._id),
      )
      .take(MAX_REUSABLE_WEBSITE_DOCUMENTS_TO_CHECK);

    if (documents.some(isUsableWebsiteKnowledgeDocument)) {
      return job;
    }
  }

  return null;
}

async function requireBusinessAtOrPastWebsiteStage(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found.");
  }

  const stage = normalizeOnboardingStage(business.onboardingStage);
  if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.website) {
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

async function requireBusinessAtOrPastWebsiteStageForAction(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const business = await ctx.runQuery(internal.businesses.admin.getBusinessById, {
    businessId,
  });
  if (!business) {
    throw new Error("Business not found.");
  }

  const stage = normalizeOnboardingStage(business.onboardingStage);
  if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.website) {
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
    await requireTenantAdminMembership(ctx, args.businessId);
    await requireBusinessAtOrPastWebsiteStage(ctx, args.businessId);

    const completedJob = await findReusableCompletedWebsiteIngestionJob(ctx, {
      businessId: args.businessId,
      websiteUrl: args.websiteUrl,
    });

    if (completedJob) {
      const business = await ctx.db.get(args.businessId);
      const stage = normalizeOnboardingStage(business?.onboardingStage);
      await ctx.db.patch(args.businessId, {
        websiteUrl: args.websiteUrl,
        ...(ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.knowledge
          ? { onboardingStage: "knowledge" as const }
          : {}),
      });
      return {
        status: "submitted",
        websiteUrl: args.websiteUrl,
        websiteIngestionJobId: completedJob._id,
      };
    }

    return await ctx.runMutation(
      internal.ai.context.websiteIngestion.submitWebsiteIngestionAfterPreflight,
      {
        businessId: args.businessId,
        websiteUrl: args.websiteUrl,
        nextOnboardingStage: "knowledge",
      },
    );
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
    await requireBusinessAtOrPastWebsiteStageForAction(ctx, args.businessId);

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
    await requireTenantAdminMembership(ctx, args.businessId);
    await requireBusinessAtOrPastWebsiteStage(ctx, args.businessId);

    const business = await ctx.db.get(args.businessId);
    const stage = normalizeOnboardingStage(business?.onboardingStage);
    if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.knowledge) {
      await ctx.db.patch(args.businessId, {
        onboardingStage: "knowledge",
      });
    }

    return { status: "skipped" };
  },
});
