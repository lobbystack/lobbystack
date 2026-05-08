import {
  getAuthUserId } from "@convex-dev/auth/server";
import { observedInternalMutation as internalMutation, observedMutation as mutation } from "../telemetry/observedFunctions";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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
    await requireBusinessAtOrPastWebsiteStage(ctx, args.businessId);

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
