import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { scheduleSnapshotRefresh } from "../businesses/admin";
import {
  getBillingSnapshot,
  planIncludesDedicatedBusinessNumber,
} from "../lib/billing";
import { observedInternalMutation as internalMutation } from "../telemetry/observedFunctions";

export const OLD_PHONE_NUMBER_RELEASE_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
const FREE_PLAN_RECLAIM_BACKFILL_BATCH_SIZE = 50;

export const backfillFreePlanPhoneNumberReclaimsPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
    delayMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = Math.max(
      1,
      Math.min(100, Math.floor(args.numItems ?? FREE_PLAN_RECLAIM_BACKFILL_BATCH_SIZE)),
    );
    const delayMs = Math.max(0, args.delayMs ?? OLD_PHONE_NUMBER_RELEASE_DELAY_MS);
    const page = await ctx.db.query("businesses").paginate({
      cursor: args.cursor,
      numItems,
    });

    const businessIds: Array<Id<"businesses">> = [];
    for (const business of page.page) {
      if (
        business.deploymentMode !== "cloud" &&
        business.deploymentMode !== "development"
      ) {
        continue;
      }
      const snapshot = await getBillingSnapshot(ctx, { businessId: business._id });
      if (planIncludesDedicatedBusinessNumber(snapshot.plan)) {
        continue;
      }
      const phoneNumbers = await ctx.db
        .query("phone_numbers")
        .withIndex("by_business_id", (q) => q.eq("businessId", business._id))
        .collect();
      const hasReclaimable = phoneNumbers.some(
        (phoneNumber) =>
          phoneNumber.status === "active" &&
          Boolean(phoneNumber.twilioPhoneSid) &&
          phoneNumber.reclaimScheduledAt === undefined,
      );
      if (hasReclaimable) {
        businessIds.push(business._id);
      }
    }

    for (const businessId of businessIds) {
      await ctx.scheduler.runAfter(
        0,
        internal.settings.phoneNumberReclaimActions.scheduleDedicatedNumberReclaim,
        {
          businessId,
          reason: "free_plan",
          delayMs,
          sendWarningEmail: true,
        },
      );
    }

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      scheduledBusinesses: businessIds.length,
      delayMs,
    };
  },
});

export const listReclaimWarningRecipients = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("billing_accounts")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .unique();
    const emails = new Set<string>();
    if (account?.billingContactEmail) {
      emails.add(account.billingContactEmail.trim().toLowerCase());
    }

    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();
    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }
      if (membership.role !== "business_owner" && membership.role !== "business_admin") {
        continue;
      }
      const user = await ctx.db.get(membership.userId);
      if (user?.email) {
        emails.add(user.email.trim().toLowerCase());
      }
    }

    return [...emails];
  },
});

export const cancelDedicatedNumberReclaimsIfEntitled = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const snapshot = await getBillingSnapshot(ctx, { businessId: args.businessId });
    if (!planIncludesDedicatedBusinessNumber(snapshot.plan)) {
      return {
        cleared: 0,
        restored: 0,
        skippedReason: "plan_does_not_include_number" as const,
      };
    }

    const phoneNumbers = await ctx.db
      .query("phone_numbers")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();
    let cleared = 0;
    let restored = 0;

    for (const phoneNumber of phoneNumbers) {
      if (
        phoneNumber.reclaimScheduledAt === undefined &&
        phoneNumber.reclaimReason === undefined
      ) {
        continue;
      }

      const restoreActive =
        phoneNumber.status === "retiring" && Boolean(phoneNumber.twilioPhoneSid);
      await ctx.db.patch(phoneNumber._id, {
        reclaimScheduledAt: undefined,
        reclaimReason: undefined,
        ...(restoreActive ? { status: "active" } : {}),
      });
      cleared += 1;
      if (restoreActive) {
        restored += 1;
      }
    }

    if (restored > 0) {
      await scheduleSnapshotRefresh(ctx, args.businessId);
    }

    return { cleared, restored };
  },
});
