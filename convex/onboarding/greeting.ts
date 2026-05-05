import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { scheduleSnapshotRefresh } from "../businesses/admin";
import { requireMembership } from "../lib/auth";
import { DEFAULT_APPOINTMENT_CHANGE_POLICY } from "../lib/appointmentChangePolicy";
import {
  buildDefaultReceptionistSummary,
  DEFAULT_RECEPTIONIST_BOOKING_POLICY,
  DEFAULT_RECEPTIONIST_TONE,
  DEFAULT_RECEPTIONIST_TRANSFER_MODE,
} from "../lib/receptionistProfileDefaults";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

type SubmitGreetingArgs = {
  businessId: Id<"businesses">;
  greeting: string;
};

async function requireBusinessInGreetingStage(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
) {
  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found.");
  }

  if (business.onboardingStage !== "greeting") {
    throw new Error("Greeting onboarding is no longer available for this business.");
  }

  return business;
}

export const submitOnboardingGreeting = mutation({
  args: {
    businessId: v.id("businesses"),
    greeting: v.string(),
  },
  handler: async (ctx, args: SubmitGreetingArgs): Promise<{ status: "submitted" }> => {
    await requireMembership(ctx, args.businessId);
    const business = await requireBusinessInGreetingStage(ctx, args.businessId);
    const greeting = args.greeting.trim();

    if (greeting.length === 0) {
      throw new Error("Enter a greeting before continuing.");
    }

    const existing = await ctx.db
      .query("receptionist_profiles")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { greeting });
    } else {
      await ctx.db.insert("receptionist_profiles", {
        businessId: args.businessId,
        greeting,
        tone: DEFAULT_RECEPTIONIST_TONE,
        summary: buildDefaultReceptionistSummary(business.name),
        bookingPolicy: DEFAULT_RECEPTIONIST_BOOKING_POLICY,
        transferMode: DEFAULT_RECEPTIONIST_TRANSFER_MODE,
        appointmentChangePolicy: DEFAULT_APPOINTMENT_CHANGE_POLICY,
      });
    }

    await ctx.db.patch(args.businessId, {
      onboardingStage: "verify_phone",
    });
    await scheduleSnapshotRefresh(ctx, args.businessId);

    return { status: "submitted" };
  },
});
