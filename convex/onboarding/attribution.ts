import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ensureCurrentUser, requireTenantAdminMembership } from "../lib/auth";
import { ONBOARDING_STAGE_INDEX, normalizeOnboardingStage } from "../lib/onboardingStage";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

type SubmitAttributionArgs = {
  businessId: Id<"businesses">;
  source?: string | null;
};

async function requireBusinessInAttributionStage(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
) {
  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found.");
  }

  const stage = normalizeOnboardingStage(business.onboardingStage);
  if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.attribution) {
    throw new Error("Attribution onboarding is no longer available for this business.");
  }
}

export const submitOnboardingAttribution = mutation({
  args: {
    businessId: v.id("businesses"),
    source: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args: SubmitAttributionArgs): Promise<{ status: "submitted" }> => {
    await requireTenantAdminMembership(ctx, args.businessId);
    await requireBusinessInAttributionStage(ctx, args.businessId);
    const user = await ensureCurrentUser(ctx);
    const source = args.source?.trim();

    if (source) {
      await ctx.db.patch(user._id, {
        signupAttribution: source,
      });
    }

    await ctx.db.patch(args.businessId, {
      onboardingStage: "completed",
    });

    return { status: "submitted" };
  },
});
