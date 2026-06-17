import {
  v } from "convex/values";
import { observedMutation as mutation } from "../telemetry/observedFunctions";
import { internalQuery, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ensureCurrentUser, getCurrentUser, requireMembership } from "../lib/auth";
import { ensureDefaultStaffForBusiness } from "../lib/defaultStaff";
import { assertBootstrapAllowed } from "../onboarding/abuse";
import { workflowManager } from "../lib/components";
import {
  enqueuePostHogOutboxRecord,
  serializePostHogEvent,
} from "../telemetry/posthog";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "../telemetry/shared";
import {
  buildDefaultReceptionistSummary,
  DEFAULT_RECEPTIONIST_BOOKING_POLICY,
  DEFAULT_RECEPTIONIST_TONE,
  DEFAULT_RECEPTIONIST_TRANSFER_MODE,
} from "../lib/receptionistProfileDefaults";
import { DEFAULT_APPOINTMENT_CHANGE_POLICY } from "../lib/appointmentChangePolicy";
import { ONBOARDING_STAGE_INDEX, normalizeOnboardingStage } from "../lib/onboardingStage";

import { observedInternalMutation as internalMutation } from "../telemetry/observedFunctions";

const businessDeploymentModes = new Set([
  "cloud",
  "self_hosted_standard",
  "development",
]);
const PHONE_NUMBER_REPLACEMENT_RESERVATION_MAX_AGE_MS = 15 * 60 * 1000;

function normalizeBootstrapBusinessName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getBusinessDeploymentMode(): string {
  const deploymentMode = process.env.DEPLOYMENT_MODE;
  return deploymentMode && businessDeploymentModes.has(deploymentMode)
    ? deploymentMode
    : "development";
}

async function findExistingBootstrapBusiness(
  ctx: Parameters<typeof ensureCurrentUser>[0],
  input: {
    userId: Id<"users">;
    activeBusinessId?: Id<"businesses">;
    name: string;
  },
): Promise<Id<"businesses"> | null> {
  const normalizedName = normalizeBootstrapBusinessName(input.name);
  if (!normalizedName) {
    return null;
  }

  const memberships = await ctx.db
    .query("business_memberships")
    .withIndex("by_user_id_and_business_id", (q) => q.eq("userId", input.userId))
    .collect();
  const matchingBusinessIds: Array<Id<"businesses">> = [];

  for (const membership of memberships) {
    if (membership.status !== "active") {
      continue;
    }
    const business = await ctx.db.get(membership.businessId);
    if (
      business?.status === "active" &&
      normalizeBootstrapBusinessName(business.name) === normalizedName
    ) {
      matchingBusinessIds.push(business._id);
    }
  }

  if (input.activeBusinessId && matchingBusinessIds.includes(input.activeBusinessId)) {
    return input.activeBusinessId;
  }

  return matchingBusinessIds[0] ?? null;
}

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
    const existingBusinessId = await findExistingBootstrapBusiness(ctx, {
      userId: user._id,
      ...(user.activeBusinessId ? { activeBusinessId: user.activeBusinessId } : {}),
      name: args.name,
    });
    if (existingBusinessId) {
      if (user.activeBusinessId !== existingBusinessId) {
        await ctx.db.patch(user._id, { activeBusinessId: existingBusinessId });
      }
      return { businessId: existingBusinessId };
    }

    await assertBootstrapAllowed(ctx, user._id);
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
      // Always advance to the website step after bootstrap. Phone
      // verification now happens later in the redesigned flow, after
      // the user has supplied a website, knowledge, and greeting.
      onboardingStage: "website",
      businessType: args.businessType,
      deploymentMode: getBusinessDeploymentMode(),
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
      appointmentChangePolicy: DEFAULT_APPOINTMENT_CHANGE_POLICY,
    });

    await ensureDefaultStaffForBusiness(ctx, {
      businessId,
      timezone: args.timezone,
    });

    await ctx.db.patch(user._id, { activeBusinessId: businessId });

    await workflowManager.start(
      ctx,
      internal.ai.workflows.runtime.refreshBusinessContextSnapshotWorkflow,
      { businessId },
    );
    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "workflow.started",
        businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(businessId)),
        groupKey: getPostHogBusinessGroupKey(String(businessId)),
        properties: {
          workflowName: "refreshBusinessContextSnapshotWorkflow",
        },
      }),
    );

    return { businessId };
  },
});

export const getBusinessById = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.businessId);
  },
});

export const setOnboardingStage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    onboardingStage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.businessId, {
      onboardingStage: args.onboardingStage,
    });
    return args.onboardingStage;
  },
});

export const advanceOnboardingStage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    onboardingStage: v.string(),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    const currentStage = normalizeOnboardingStage(business.onboardingStage);
    const nextStage = normalizeOnboardingStage(args.onboardingStage);
    if (ONBOARDING_STAGE_INDEX[currentStage] < ONBOARDING_STAGE_INDEX[nextStage]) {
      await ctx.db.patch(args.businessId, {
        onboardingStage: nextStage,
      });
    }
    return business.onboardingStage;
  },
});

export const beginOnboardingNumberClaim = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    if (business.onboardingStage === "phone_number_claiming") {
      throw new Error("A phone-number claim is already in progress for this business.");
    }

    if (business.onboardingStage !== "phone_number") {
      throw new Error("Phone-number onboarding has already been completed for this business.");
    }

    await ctx.db.patch(args.businessId, {
      onboardingStage: "phone_number_claiming",
    });

    return "phone_number_claiming";
  },
});

export const releaseOnboardingNumberClaim = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    if (business.onboardingStage === "phone_number_claiming") {
      await ctx.db.patch(args.businessId, {
        onboardingStage: "phone_number",
      });
    }

    return "phone_number";
  },
});

export const reservePhoneNumberReplacement = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    if (business.phoneNumberReplacementUsedAt) {
      throw new Error("This business has already used its phone number change.");
    }

    const reservedAt = business.phoneNumberReplacementReservedAt
      ? Date.parse(business.phoneNumberReplacementReservedAt)
      : Number.NaN;
    if (
      Number.isFinite(reservedAt) &&
      Date.now() - reservedAt < PHONE_NUMBER_REPLACEMENT_RESERVATION_MAX_AGE_MS
    ) {
      throw new Error("A phone number change is already in progress.");
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.businessId, {
      phoneNumberReplacementReservedAt: now,
    });
    return now;
  },
});

export const markPhoneNumberReplacementUsed = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    if (business.phoneNumberReplacementUsedAt) {
      return business.phoneNumberReplacementUsedAt;
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.businessId, {
      phoneNumberReplacementReservedAt: undefined,
      phoneNumberReplacementUsedAt: now,
    });
    return now;
  },
});

export const releasePhoneNumberReplacementReservation = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business || business.phoneNumberReplacementUsedAt) {
      return null;
    }

    await ctx.db.patch(args.businessId, {
      phoneNumberReplacementReservedAt: undefined,
    });
    return null;
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
      if (membership.status !== "active") {
        continue;
      }
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
