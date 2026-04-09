import type {
  BillingPaidTier,
  BillingTier,
  BillingUsageSnapshot,
} from "../../packages/shared/src/billing";
import {
  billingDefaults,
  billingPaidTiers,
  billingPlanCatalog,
  isPaidBillingTier,
} from "../../packages/shared/src/billing";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Reader = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export function getBillingKey(businessId: Id<"businesses"> | string): string {
  return `business:${String(businessId)}`;
}

export function getBillingPeriodKey(input: Date | number | string = Date.now()): string {
  const date = input instanceof Date ? input : new Date(input);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getBillingResetAt(periodKey: string): string {
  const [yearText, monthText] = periodKey.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return new Date().toISOString();
  }

  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString();
}

export function getBillingIncludedUsage(tier: BillingTier): {
  voiceSecondsIncluded: number | null;
  smsSegmentsIncluded: number | null;
} {
  if (isPaidBillingTier(tier)) {
    return {
      voiceSecondsIncluded: null,
      smsSegmentsIncluded: null,
    };
  }

  return {
    voiceSecondsIncluded: billingDefaults.freeVoiceSeconds,
    smsSegmentsIncluded: billingDefaults.freeSmsSegments,
  };
}

export function getBillingMinimumChargeCents(tier: BillingTier): number | null {
  return billingPlanCatalog[tier].minimumMonthlyChargeCents;
}

function getBillingProductEnvVarName(plan: BillingPaidTier): string {
  switch (plan) {
    case "starter":
      return "POLAR_STARTER_PRODUCT_ID";
    case "growth":
      return "POLAR_GROWTH_PRODUCT_ID";
  }
}

export function getBillingProductIdForPlan(plan: BillingPaidTier): string {
  const envVarName = getBillingProductEnvVarName(plan);
  const productId = process.env[envVarName]?.trim();

  if (!productId) {
    throw new Error(`${envVarName} is required.`);
  }

  return productId;
}

export function getConfiguredCheckoutPlans(): Array<BillingPaidTier> {
  return billingPaidTiers.filter(
    (plan) => Boolean(process.env[getBillingProductEnvVarName(plan)]?.trim()),
  );
}

export function getBillingUsageSnapshotData(args: {
  tier: BillingTier;
  periodKey: string;
  usage: Doc<"billing_usage_months"> | null;
}): BillingUsageSnapshot {
  const included = getBillingIncludedUsage(args.tier);
  const voiceSecondsUsed = args.usage?.voiceSecondsUsed ?? 0;
  const smsSegmentsUsed = args.usage?.smsSegmentsUsed ?? 0;
  const voiceSecondsRemaining =
    included.voiceSecondsIncluded === null
      ? null
      : Math.max(0, included.voiceSecondsIncluded - voiceSecondsUsed);
  const smsSegmentsRemaining =
    included.smsSegmentsIncluded === null
      ? null
      : Math.max(0, included.smsSegmentsIncluded - smsSegmentsUsed);

  return {
    periodKey: args.periodKey,
    resetAt: getBillingResetAt(args.periodKey),
    voiceSecondsUsed,
    smsSegmentsUsed,
    voiceSecondsIncluded: included.voiceSecondsIncluded,
    smsSegmentsIncluded: included.smsSegmentsIncluded,
    voiceSecondsRemaining,
    smsSegmentsRemaining,
    voiceBlocked:
      included.voiceSecondsIncluded === null
        ? false
        : voiceSecondsUsed >= included.voiceSecondsIncluded,
    smsBlocked:
      included.smsSegmentsIncluded === null
        ? false
        : smsSegmentsUsed >= included.smsSegmentsIncluded,
  };
}

export function isPaidSubscriptionStatus(status: string | undefined): boolean {
  return status === "active" || status === "trialing";
}

export function deriveBillingTier(input: {
  subscriptionStatus?: string;
  subscriptionProductId?: string;
}): BillingTier {
  if (!isPaidSubscriptionStatus(input.subscriptionStatus)) {
    return "free";
  }

  for (const plan of billingPaidTiers) {
    if (input.subscriptionProductId === process.env[getBillingProductEnvVarName(plan)]?.trim()) {
      return plan;
    }
  }

  return "free";
}

export async function getBillingAccount(
  ctx: Reader,
  businessId: Id<"businesses">,
): Promise<Doc<"billing_accounts"> | null> {
  return await ctx.db
    .query("billing_accounts")
    .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
    .unique();
}

export async function getBillingUsageMonth(
  ctx: Reader,
  args: {
    businessId: Id<"businesses">;
    periodKey: string;
  },
): Promise<Doc<"billing_usage_months"> | null> {
  return await ctx.db
    .query("billing_usage_months")
    .withIndex("by_business_id_and_period_key", (q) =>
      q.eq("businessId", args.businessId).eq("periodKey", args.periodKey),
    )
    .unique();
}

export async function getBillingSnapshot(
  ctx: Reader,
  args: {
    businessId: Id<"businesses">;
    at?: string;
  },
): Promise<{
    account: Doc<"billing_accounts"> | null;
    periodKey: string;
    tier: BillingTier;
    usage: Doc<"billing_usage_months"> | null;
  }> {
  const account = await getBillingAccount(ctx, args.businessId);
  const tier: BillingTier =
    account?.currentTier === "starter" || account?.currentTier === "growth"
      ? account.currentTier
      : "free";
  const periodKey = getBillingPeriodKey(args.at ?? Date.now());
  const usage = await getBillingUsageMonth(ctx, {
    businessId: args.businessId,
    periodKey,
  });

  return {
    account,
    periodKey,
    tier,
    usage,
  };
}
