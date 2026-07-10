"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { planIncludesDedicatedBusinessNumber } from "../lib/billing";
import { sendTransactionalEmail } from "../lib/providers/email";
import { observedInternalAction as internalAction } from "../telemetry/observedFunctions";
import { OLD_PHONE_NUMBER_RELEASE_DELAY_MS } from "./phoneNumberReclaim";

type ReclaimReason = "free_plan" | "downgrade";

export const scheduleDedicatedNumberReclaim = internalAction({
  args: {
    businessId: v.id("businesses"),
    reason: v.union(v.literal("free_plan"), v.literal("downgrade")),
    delayMs: v.optional(v.number()),
    sendWarningEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.runQuery(internal.billing.getBillingSnapshotInternal, {
      businessId: args.businessId,
    });
    if (planIncludesDedicatedBusinessNumber(snapshot.plan)) {
      return { scheduled: 0, skippedReason: "plan_includes_number" as const };
    }

    const activeNumbers = await ctx.runQuery(
      internal.businesses.catalog.listActivePhoneNumbersForBusinessInternal,
      { businessId: args.businessId },
    );
    if (activeNumbers.length === 0) {
      return { scheduled: 0, skippedReason: "no_active_number" as const };
    }

    const delayMs = Math.max(0, args.delayMs ?? OLD_PHONE_NUMBER_RELEASE_DELAY_MS);
    const reclaimScheduledAt = Date.now() + delayMs;
    let scheduled = 0;

    for (const phoneNumber of activeNumbers) {
      if (!phoneNumber.twilioPhoneSid) {
        continue;
      }
      const result = await ctx.runMutation(
        internal.businesses.catalog.markPhoneNumberReclaimScheduled,
        {
          phoneNumberId: phoneNumber._id,
          reclaimScheduledAt,
          reclaimReason: args.reason,
        },
      );
      if (!result.scheduled && !result.alreadyScheduled) {
        continue;
      }

      const releaseAt = result.reclaimScheduledAt ?? reclaimScheduledAt;
      await ctx.scheduler.runAt(
        releaseAt,
        internal.settings.phoneNumberReclaimActions.releaseFreePlanPhoneNumber,
        {
          phoneNumberId: phoneNumber._id,
          twilioPhoneSid: result.twilioPhoneSid ?? phoneNumber.twilioPhoneSid,
          businessId: args.businessId,
        },
      );

      if (result.scheduled) {
        scheduled += 1;
        if (args.sendWarningEmail !== false) {
          await sendReclaimWarningEmail(ctx, {
            businessId: args.businessId,
            e164: result.e164 ?? phoneNumber.e164,
            reclaimScheduledAt: releaseAt,
            reason: args.reason,
          });
        }
      }
    }

    return { scheduled };
  },
});

export const cancelDedicatedNumberReclaim = internalAction({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const activeNumbers = await ctx.runQuery(
      internal.businesses.catalog.listActivePhoneNumbersForBusinessInternal,
      { businessId: args.businessId },
    );
    let cleared = 0;
    for (const phoneNumber of activeNumbers) {
      const result = await ctx.runMutation(
        internal.businesses.catalog.clearPhoneNumberReclaimSchedule,
        { phoneNumberId: phoneNumber._id },
      );
      if (result.cleared) {
        cleared += 1;
      }
    }
    return { cleared };
  },
});

export const releaseFreePlanPhoneNumber = internalAction({
  args: {
    phoneNumberId: v.id("phone_numbers"),
    twilioPhoneSid: v.string(),
    businessId: v.id("businesses"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    released: boolean;
    skipped: boolean;
    reason?: "plan_includes_number" | "not_due";
    retryScheduled?: boolean;
  }> => {
    const phoneNumber: {
      businessId: Id<"businesses">;
      twilioPhoneSid?: string;
      reclaimScheduledAt?: number;
      status: string;
    } | null = await ctx.runQuery(internal.businesses.catalog.getPhoneNumberById, {
      phoneNumberId: args.phoneNumberId,
    });
    if (
      !phoneNumber ||
      phoneNumber.businessId !== args.businessId ||
      phoneNumber.twilioPhoneSid !== args.twilioPhoneSid
    ) {
      return { released: false, skipped: true };
    }

    const snapshot = await ctx.runQuery(internal.billing.getBillingSnapshotInternal, {
      businessId: args.businessId,
    });
    if (planIncludesDedicatedBusinessNumber(snapshot.plan)) {
      await ctx.runMutation(internal.businesses.catalog.clearPhoneNumberReclaimSchedule, {
        phoneNumberId: args.phoneNumberId,
      });
      return { released: false, skipped: true, reason: "plan_includes_number" };
    }

    if (
      phoneNumber.reclaimScheduledAt === undefined ||
      phoneNumber.reclaimScheduledAt > Date.now()
    ) {
      return { released: false, skipped: true, reason: "not_due" };
    }

    if (phoneNumber.status === "active") {
      await ctx.runMutation(internal.businesses.catalog.markPhoneNumberRetiringForReclaim, {
        phoneNumberId: args.phoneNumberId,
        twilioPhoneSid: args.twilioPhoneSid,
      });
    }

    const releaseResult: {
      released: boolean;
      skipped: boolean;
      retryScheduled?: boolean;
    } = await ctx.runAction(internal.settings.phoneNumbers.releaseInactiveTwilioPhoneNumber, {
      phoneNumberId: args.phoneNumberId,
      twilioPhoneSid: args.twilioPhoneSid,
    });
    return releaseResult;
  },
});

export const runDuePhoneNumberReclaims = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scanned: number; released: number }> => {
    const now = Date.now();
    let cursor: string | null = null;
    let isDone = false;
    let released = 0;
    let scanned = 0;

    while (!isDone) {
      const page: {
        page: Array<{
          _id: Id<"phone_numbers">;
          businessId: Id<"businesses">;
          twilioPhoneSid?: string;
        }>;
        continueCursor: string;
        isDone: boolean;
      } = await ctx.runQuery(internal.businesses.catalog.listDuePhoneNumberReclaimsPage, {
        now,
        cursor,
        numItems: 50,
      });
      scanned += page.page.length;

      for (const phoneNumber of page.page) {
        if (!phoneNumber.twilioPhoneSid) {
          continue;
        }
        const result: {
          released: boolean;
          skipped: boolean;
          reason?: "plan_includes_number" | "not_due";
          retryScheduled?: boolean;
        } = await ctx.runAction(
          internal.settings.phoneNumberReclaimActions.releaseFreePlanPhoneNumber,
          {
            phoneNumberId: phoneNumber._id,
            twilioPhoneSid: phoneNumber.twilioPhoneSid,
            businessId: phoneNumber.businessId,
          },
        );
        if (result.released) {
          released += 1;
        }
      }

      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return { scanned, released };
  },
});

export const startFreePlanPhoneNumberReclaimBackfill = internalAction({
  args: {
    delayMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ scheduledBusinesses: number; delayMs: number }> => {
    let cursor: string | null = null;
    let isDone = false;
    let scheduledBusinesses = 0;
    const delayMs = args.delayMs ?? OLD_PHONE_NUMBER_RELEASE_DELAY_MS;

    while (!isDone) {
      const page: {
        continueCursor: string;
        isDone: boolean;
        scheduledBusinesses: number;
        delayMs: number;
      } = await ctx.runMutation(
        internal.settings.phoneNumberReclaim.backfillFreePlanPhoneNumberReclaimsPage,
        {
          cursor,
          delayMs,
        },
      );
      scheduledBusinesses += page.scheduledBusinesses;
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return { scheduledBusinesses, delayMs };
  },
});

async function sendReclaimWarningEmail(
  ctx: ActionCtx,
  input: {
    businessId: Id<"businesses">;
    e164: string;
    reclaimScheduledAt: number;
    reason: ReclaimReason;
  },
) {
  try {
    const emails: Array<string> = await ctx.runQuery(
      internal.settings.phoneNumberReclaim.listReclaimWarningRecipients,
      { businessId: input.businessId },
    );
    if (emails.length === 0) {
      return;
    }
    const releaseDate = new Date(input.reclaimScheduledAt).toISOString().slice(0, 10);
    const appOrigin = process.env.SITE_URL?.trim() || "https://app.lobbystack.com";
    for (const to of emails) {
      await sendTransactionalEmail(ctx, {
        template: "operator_alert",
        to,
        subject: "Your LobbyStack business number will be released in 30 days",
        variables: {
          body: `Your dedicated business number ${input.e164} will be released on ${releaseDate} because your account is on the Free plan. Upgrade to Starter or Pro before then to keep this number: ${appOrigin}/settings/plan`,
        },
      });
    }
  } catch {
    // Best-effort warning; reclaim scheduling must not fail on email errors.
  }
}
