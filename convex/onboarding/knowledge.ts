import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireMembership } from "../lib/auth";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

type BusinessIdArgs = {
  businessId: Id<"businesses">;
};

async function requireBusinessInKnowledgeStage(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found.");
  }

  if (business.onboardingStage !== "knowledge") {
    throw new Error("Knowledge onboarding is no longer available for this business.");
  }
}

export const completeOnboardingKnowledge = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args: BusinessIdArgs): Promise<{ status: "completed" }> => {
    await requireMembership(ctx, args.businessId);
    await requireBusinessInKnowledgeStage(ctx, args.businessId);

    await ctx.db.patch(args.businessId, {
      onboardingStage: "greeting",
    });

    return { status: "completed" };
  },
});

export const skipOnboardingKnowledge = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args: BusinessIdArgs): Promise<{ status: "skipped" }> => {
    await requireMembership(ctx, args.businessId);
    await requireBusinessInKnowledgeStage(ctx, args.businessId);

    await ctx.db.patch(args.businessId, {
      onboardingStage: "greeting",
    });

    return { status: "skipped" };
  },
});
