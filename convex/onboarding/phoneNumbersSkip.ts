import { v } from "convex/values";

import { requireTenantAdminMembership } from "../lib/auth";
import { ONBOARDING_STAGE_INDEX, normalizeOnboardingStage } from "../lib/onboardingStage";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

/**
 * Allow the user to skip the phone-number-selection step during onboarding.
 *
 * Paid operators can claim a number later from settings. This mutation advances
 * from the phone-number stage straight to attribution without provisioning.
 */
export const skipOnboardingNumber = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<{ status: "skipped" }> => {
    await requireTenantAdminMembership(ctx, args.businessId);
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    const stage = normalizeOnboardingStage(business.onboardingStage);
    if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.phone_number) {
      throw new Error("Phone-number onboarding is no longer available for this business.");
    }

    if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.attribution) {
      await ctx.db.patch(args.businessId, {
        onboardingStage: "attribution",
      });
    }

    return { status: "skipped" };
  },
});
