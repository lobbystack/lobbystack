import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ensureCurrentUser, getCurrentUser, requireMembership } from "../lib/auth";
import { workflowManager } from "../lib/components";
import {
  buildDefaultReceptionistSummary,
  DEFAULT_RECEPTIONIST_BOOKING_POLICY,
  DEFAULT_RECEPTIONIST_TONE,
  DEFAULT_RECEPTIONIST_TRANSFER_MODE,
} from "../lib/receptionistProfileDefaults";

/**
 * Create the initial tenant and owner membership for the authenticated user.
 */
export const bootstrapBusiness = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    timezone: v.string(),
    businessType: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ensureCurrentUser(ctx);
    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existing) {
      throw new Error("Business slug already exists.");
    }

    const businessId = await ctx.db.insert("businesses", {
      slug: args.slug,
      name: args.name,
      timezone: args.timezone,
      defaultLocale: "en",
      businessType: args.businessType,
      deploymentMode: "development",
      status: "active",
    });

    await ctx.db.insert("business_memberships", {
      businessId,
      userId: user._id,
      role: "business_owner",
      status: "active",
    });

    await ctx.db.insert("receptionist_profiles", {
      businessId,
      greeting: `Thanks for calling ${args.name}.`,
      tone: DEFAULT_RECEPTIONIST_TONE,
      summary: buildDefaultReceptionistSummary(args.name),
      bookingPolicy: DEFAULT_RECEPTIONIST_BOOKING_POLICY,
      voiceInstructions:
        "Sound calm, confident, and concise. Escalate urgent requests to a human when policy requires it.",
      smsInstructions:
        "Keep replies concise and friendly. Ask one follow-up question at a time.",
      transferMode: DEFAULT_RECEPTIONIST_TRANSFER_MODE,
    });

    await ctx.db.patch(user._id, { activeBusinessId: businessId });

    await workflowManager.start(
      ctx,
      internal.ai.workflows.runtime.refreshBusinessContextSnapshotWorkflow,
      { businessId },
    );

    return { businessId };
  },
});

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) => q.eq("userId", user._id))
      .collect();

    const businesses = [];
    for (const membership of memberships) {
      const business = await ctx.db.get(membership.businessId);
      if (business) {
        businesses.push({
          business,
          membership,
        });
      }
    }
    return businesses;
  },
});

export const getWorkspaceBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!business) {
      throw new Error("Business not found.");
    }

    const membership = await requireMembership(ctx, business._id);
    return { business, membership };
  },
});

export const setActiveBusiness = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const user = await ensureCurrentUser(ctx);
    await ctx.db.patch(user._id, { activeBusinessId: args.businessId });
    return null;
  },
});

export async function scheduleSnapshotRefresh(
  ctx: {
    scheduler?: unknown;
  },
  businessId: Id<"businesses">,
): Promise<Id<"_scheduled_functions"> | null> {
  if (!("scheduler" in ctx) || !ctx.scheduler) {
    return null;
  }
  const scheduled = ctx as {
    scheduler: {
      runAfter: (
        delayMs: number,
        reference: unknown,
        args: { businessId: Id<"businesses"> },
      ) => Promise<Id<"_scheduled_functions">>;
    };
  };
  return await scheduled.scheduler.runAfter(
    0,
    internal.ai.workflows.runtime.kickoffSnapshotRefresh,
    { businessId },
  );
}
