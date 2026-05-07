import { v } from "convex/values";

import { requireMembership } from "../lib/auth";
import { ONBOARDING_STAGE_INDEX, normalizeOnboardingStage } from "../lib/onboardingStage";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

/**
 * Allow the user to skip the phone-number-selection step during onboarding.
 *
 * Some operators want to wire up their existing carrier number later, or just
 * explore the dashboard before claiming a Twilio number. This mutation
 * advances the onboarding stage straight to `plan` without provisioning a
 * number. It must be called while the business is still in the
 * `phone_number` stage.
 */
export const skipOnboardingNumber = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<{ status: "skipped" }> => {
    await requireMembership(ctx, args.businessId);
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    const stage = normalizeOnboardingStage(business.onboardingStage);
    if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.phone_number) {
      throw new Error("Phone-number onboarding is no longer available for this business.");
    }

    if (ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.plan) {
      await ctx.db.patch(args.businessId, {
        onboardingStage: "plan",
      });
    }

    return { status: "skipped" };
  },
});
