import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireMembership } from "../lib/auth";
import { ONBOARDING_STAGE_INDEX, normalizeOnboardingStage } from "../lib/onboardingStage";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

const onboardingPlanValidator = v.union(
  v.literal("free_cloud"),
  v.literal("self_host"),
  v.literal("pro"),
  v.literal("enterprise"),
);

type SelectPlanArgs = {
  businessId: Id<"businesses">;
  plan: "free_cloud" | "self_host" | "pro" | "enterprise";
};

async function requireBusinessAtOrPastPlanStage(ctx: MutationCtx, businessId: Id<"businesses">) {
  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found.");
  }

  const stage = normalizeOnboardingStage(business.onboardingStage);
  if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.plan) {
    throw new Error("Plan onboarding is no longer available for this business.");
  }

  return {
    shouldAdvance: ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.attribution,
  };
}

export const selectOnboardingPlan = mutation({
  args: {
    businessId: v.id("businesses"),
    plan: onboardingPlanValidator,
  },
  handler: async (ctx, args: SelectPlanArgs): Promise<{ status: "selected" }> => {
    await requireMembership(ctx, args.businessId);
    const { shouldAdvance } = await requireBusinessAtOrPastPlanStage(ctx, args.businessId);

    if (args.plan === "pro") {
      throw new Error("Start checkout before continuing with the Pro plan.");
    }

    if (args.plan === "enterprise") {
      throw new Error("Contact sales before continuing with the Enterprise plan.");
    }

    // Free Cloud is the default account state, and self-hosted deployments are
    // represented by `businesses.deploymentMode`, not by a cloud checkout.
    if (shouldAdvance) {
      await ctx.db.patch(args.businessId, {
        onboardingStage: "attribution",
      });
    }

    return { status: "selected" };
  },
});
