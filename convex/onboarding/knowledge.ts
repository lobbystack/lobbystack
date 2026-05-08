import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireTenantAdminMembership } from "../lib/auth";
import { ONBOARDING_STAGE_INDEX, normalizeOnboardingStage } from "../lib/onboardingStage";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

type BusinessIdArgs = {
  businessId: Id<"businesses">;
};

async function requireBusinessAtOrPastKnowledgeStage(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
): Promise<{ shouldAdvance: boolean }> {
  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found.");
  }

  const stage = normalizeOnboardingStage(business.onboardingStage);
  if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.knowledge) {
    throw new Error("Knowledge onboarding is no longer available for this business.");
  }

  return {
    shouldAdvance: ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.greeting,
  };
}

export const completeOnboardingKnowledge = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args: BusinessIdArgs): Promise<{ status: "completed" }> => {
    await requireTenantAdminMembership(ctx, args.businessId);
    const { shouldAdvance } = await requireBusinessAtOrPastKnowledgeStage(ctx, args.businessId);

    if (shouldAdvance) {
      await ctx.db.patch(args.businessId, {
        onboardingStage: "greeting",
      });
    }

    return { status: "completed" };
  },
});

export const skipOnboardingKnowledge = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args: BusinessIdArgs): Promise<{ status: "skipped" }> => {
    await requireTenantAdminMembership(ctx, args.businessId);
    const { shouldAdvance } = await requireBusinessAtOrPastKnowledgeStage(ctx, args.businessId);

    if (shouldAdvance) {
      await ctx.db.patch(args.businessId, {
        onboardingStage: "greeting",
      });
    }

    return { status: "skipped" };
  },
});
