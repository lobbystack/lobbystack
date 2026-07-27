import { v } from "convex/values";
import { redactSensitiveUrlValue } from "../packages/telemetry/src/index";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireCurrentUser, requireTenantAdminMembership } from "./lib/auth";
import { isKnownOnboardingStage, ONBOARDING_STAGE_INDEX } from "./lib/onboardingStage";
import {
  observedInternalMutation,
  observedMutation,
} from "./telemetry/observedFunctions";

const COMMISSION_RATE = 0.2;
const COMMISSION_MONTHS = 12;
const HOLD_DAYS = 30;
const MIN_PAYOUT_CENTS = 10_000;
const DEFAULT_CURRENCY = "usd";
const APP_SIGNUP_URL = "https://app.lobbystack.com/signup";
const MAX_REFERRAL_CODE_LENGTH = 32;
const DASHBOARD_ELIGIBLE_PENDING_LIMIT = 1_000;
const PAYOUT_RUN_COMMISSION_LIMIT = 250;
const PAYOUT_RUN_ITEM_LIMIT = 250;
const DEFERRED_PAYOUT_REOPEN_LIMIT = 250;
const ATTRIBUTION_BACKFILL_TRANSACTION_LIMIT = 50;

const PAID_ORDER_STATUSES = new Set(["paid", "completed", "succeeded"]);
const VOID_ORDER_STATUSES = new Set([
  "canceled",
  "cancelled",
  "refunded",
  "reversed",
]);
const VOID_REFUND_STATUSES = new Set(["succeeded"]);

function nowIso(): string {
  return new Date().toISOString();
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function addMonthsIso(iso: string, months: number): string {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function monthKeyFor(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previousMonthKey(date = new Date()): string {
  return monthKeyFor(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)));
}

function normalizeReferralCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_REFERRAL_CODE_LENGTH);
}

function referralCodeBaseForUser(user: Doc<"users">): string {
  const preferred =
    user.displayName ??
    user.name ??
    user.email?.split("@")[0] ??
    `user-${String(user._id).slice(-8)}`;
  return normalizeReferralCode(preferred) || `user-${String(user._id).slice(-8)}`;
}

function referralCodeCandidate(base: string, index: number): string {
  if (index === 0) {
    return base;
  }
  const suffix = `-${index + 1}`;
  const prefix = base.slice(0, MAX_REFERRAL_CODE_LENGTH - suffix.length).replace(/-+$/g, "");
  return normalizeReferralCode(`${prefix}${suffix}`);
}

async function getProfileForUser(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<Doc<"affiliate_profiles"> | null> {
  return await ctx.db
    .query("affiliate_profiles")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique();
}

async function getProfileByReferralCode(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  referralCode: string,
): Promise<Doc<"affiliate_profiles"> | null> {
  return await ctx.db
    .query("affiliate_profiles")
    .withIndex("by_referral_code", (q) => q.eq("referralCode", referralCode))
    .unique();
}

async function generateReferralCode(
  ctx: Pick<MutationCtx, "db">,
  user: Doc<"users">,
): Promise<string> {
  const base = referralCodeBaseForUser(user);
  for (let index = 0; index < 25; index += 1) {
    const candidate = referralCodeCandidate(base, index);
    const existing = await getProfileByReferralCode(ctx, candidate);
    if (!existing) {
      return candidate;
    }
  }
  const suffix = `-${String(user._id).slice(-8)}`;
  const prefix = base.slice(0, MAX_REFERRAL_CODE_LENGTH - suffix.length).replace(/-+$/g, "");
  return normalizeReferralCode(`${prefix}${suffix}`);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertLooksLikeEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
}

function centsForCommission(amountCents: number): number {
  return Math.max(0, Math.floor(amountCents * COMMISSION_RATE));
}

async function adjustUnpaidPayoutItemAmount(
  ctx: Pick<MutationCtx, "db">,
  payoutItemId: Id<"affiliate_payout_items">,
  amountDeltaCents: number,
  updatedAt: string,
  zeroStatus: "draft" | "voided",
): Promise<void> {
  if (amountDeltaCents === 0) {
    return;
  }
  const payoutItem = await ctx.db.get(payoutItemId);
  if (!payoutItem || payoutItem.status === "paid") {
    return;
  }
  const previousReadyCents = payoutItem.status === "ready" ? payoutItem.amountCents : 0;
  const nextAmountCents = Math.max(0, payoutItem.amountCents + amountDeltaCents);
  const nextStatus =
    nextAmountCents === 0
      ? zeroStatus
      : nextAmountCents >= MIN_PAYOUT_CENTS
        ? "ready"
        : "draft";
  const nextReadyCents = nextStatus === "ready" ? nextAmountCents : 0;
  await ctx.db.patch(payoutItem._id, {
    amountCents: nextAmountCents,
    status: nextStatus,
    updatedAt,
  });

  const totalDeltaCents = nextReadyCents - previousReadyCents;
  if (totalDeltaCents === 0) {
    return;
  }
  const payoutRun = await ctx.db.get(payoutItem.payoutRunId);
  if (payoutRun && payoutRun.status !== "paid") {
    await ctx.db.patch(payoutRun._id, {
      totalCents: Math.max(0, payoutRun.totalCents + totalDeltaCents),
      updatedAt,
    });
  }
}

async function getAttributionForBusiness(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  businessId: Id<"businesses">,
): Promise<Doc<"affiliate_attributions"> | null> {
  return await ctx.db
    .query("affiliate_attributions")
    .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
    .unique();
}

async function scheduleCommissionBackfillForBusiness(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const transactions = await ctx.db
    .query("billing_transactions")
    .withIndex("by_business_id_and_occurred_at", (q) => q.eq("businessId", businessId))
    .order("desc")
    .take(ATTRIBUTION_BACKFILL_TRANSACTION_LIMIT);

  for (const transaction of transactions) {
    if (
      transaction.kind !== "order" ||
      !PAID_ORDER_STATUSES.has(transaction.status.toLowerCase())
    ) {
      continue;
    }
    await ctx.scheduler.runAfter(
      0,
      internal.affiliates.createCommissionForBillingTransaction,
      {
        billingTransactionId: transaction._id,
        businessId: transaction.businessId,
        kind: transaction.kind,
        sourceId: transaction.sourceId,
        status: transaction.status,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        ...(transaction.orderId ? { orderId: transaction.orderId } : {}),
        occurredAt: transaction.occurredAt,
      },
    );
  }
}

async function createAttributionForBusiness(
  ctx: MutationCtx,
  args: {
    affiliateProfileId: Id<"affiliate_profiles">;
    businessId: Id<"businesses">;
    referredUserId: Id<"users">;
    referralCode: string;
  },
): Promise<void> {
  await ctx.db.insert("affiliate_attributions", {
    affiliateProfileId: args.affiliateProfileId,
    businessId: args.businessId,
    referredUserId: args.referredUserId,
    referralCode: args.referralCode,
    source: "via",
    attributedAt: nowIso(),
  });
  await adjustStatsForProfile(ctx, args.affiliateProfileId, { referralCount: 1 });
  await scheduleCommissionBackfillForBusiness(ctx, args.businessId);
}

async function getVoidedSourceBySourceKey(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  sourceKey: string,
): Promise<Doc<"affiliate_voided_sources"> | null> {
  return await ctx.db
    .query("affiliate_voided_sources")
    .withIndex("by_source_key", (q) => q.eq("sourceKey", sourceKey))
    .unique();
}

async function recordVoidedSource(
  ctx: Pick<MutationCtx, "db">,
  input: {
    sourceKey: string;
    businessId: Id<"businesses">;
    billingTransactionId: Id<"billing_transactions">;
    amountCents: number;
    currency: string;
    status: string;
    reason: string;
    voidedAt: string;
  },
): Promise<void> {
  const existing = await getVoidedSourceBySourceKey(ctx, input.sourceKey);
  const patch = {
    businessId: input.businessId,
    billingTransactionId: input.billingTransactionId,
    amountCents: input.amountCents,
    currency: input.currency.toLowerCase(),
    status: input.status,
    reason: input.reason,
    voidedAt: input.voidedAt,
    updatedAt: input.voidedAt,
  };
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return;
  }
  await ctx.db.insert("affiliate_voided_sources", {
    sourceKey: input.sourceKey,
    ...patch,
  });
}

async function getStatsForProfile(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  affiliateProfileId: Id<"affiliate_profiles">,
): Promise<Doc<"affiliate_profile_stats"> | null> {
  return await ctx.db
    .query("affiliate_profile_stats")
    .withIndex("by_affiliate_profile_id", (q) =>
      q.eq("affiliateProfileId", affiliateProfileId),
    )
    .unique();
}

async function ensureStatsForProfile(
  ctx: Pick<MutationCtx, "db">,
  affiliateProfileId: Id<"affiliate_profiles">,
): Promise<Doc<"affiliate_profile_stats">> {
  const existing = await getStatsForProfile(ctx, affiliateProfileId);
  if (existing) {
    return existing;
  }
  const updatedAt = nowIso();
  const statsId = await ctx.db.insert("affiliate_profile_stats", {
    affiliateProfileId,
    clickCount: 0,
    referralCount: 0,
    conversionCount: 0,
    pendingCommissionCents: 0,
    paidCommissionCents: 0,
    updatedAt,
  });
  const created = await ctx.db.get(statsId);
  if (!created) {
    throw new Error("Affiliate stats were not created.");
  }
  return created;
}

async function adjustStatsForProfile(
  ctx: Pick<MutationCtx, "db">,
  affiliateProfileId: Id<"affiliate_profiles">,
  delta: {
    clickCount?: number;
    referralCount?: number;
    conversionCount?: number;
    pendingCommissionCents?: number;
    paidCommissionCents?: number;
  },
): Promise<void> {
  const stats = await ensureStatsForProfile(ctx, affiliateProfileId);
  await ctx.db.patch(stats._id, {
    clickCount: Math.max(0, stats.clickCount + (delta.clickCount ?? 0)),
    referralCount: Math.max(0, stats.referralCount + (delta.referralCount ?? 0)),
    conversionCount: Math.max(0, stats.conversionCount + (delta.conversionCount ?? 0)),
    pendingCommissionCents: Math.max(
      0,
      stats.pendingCommissionCents + (delta.pendingCommissionCents ?? 0),
    ),
    paidCommissionCents: Math.max(
      0,
      stats.paidCommissionCents + (delta.paidCommissionCents ?? 0),
    ),
    updatedAt: nowIso(),
  });
}

async function getDashboardStats(
  ctx: QueryCtx,
  profile: Doc<"affiliate_profiles">,
) {
  const stats = await getStatsForProfile(ctx, profile._id);
  if (!stats) {
    const [clicks, attributions, commissions] = await Promise.all([
      ctx.db
        .query("affiliate_clicks")
        .withIndex("by_affiliate_profile_id_and_clicked_at", (q) =>
          q.eq("affiliateProfileId", profile._id),
        )
        .take(DASHBOARD_ELIGIBLE_PENDING_LIMIT),
      ctx.db
        .query("affiliate_attributions")
        .withIndex("by_affiliate_profile_id_and_attributed_at", (q) =>
          q.eq("affiliateProfileId", profile._id),
        )
        .take(DASHBOARD_ELIGIBLE_PENDING_LIMIT),
      ctx.db
        .query("affiliate_commissions")
        .withIndex("by_affiliate_profile_id_and_status", (q) =>
          q.eq("affiliateProfileId", profile._id),
        )
        .take(DASHBOARD_ELIGIBLE_PENDING_LIMIT),
    ]);

    const now = nowIso();
    let pendingCents = 0;
    let eligibleCents = 0;
    let paidCents = 0;
    for (const commission of commissions) {
      if (commission.status === "paid") {
        paidCents += commission.commissionCents;
      } else if (commission.status === "pending") {
        if (commission.clearsAt <= now) {
          eligibleCents += commission.commissionCents;
        } else {
          pendingCents += commission.commissionCents;
        }
      }
    }

    return {
      clicks: clicks.length,
      referrals: attributions.length,
      conversions: commissions.filter((commission) => commission.status !== "voided")
        .length,
      pendingCents,
      eligibleCents,
      paidCents,
    };
  }

  const eligibleCommissions = await ctx.db
    .query("affiliate_commissions")
    .withIndex("by_affiliate_profile_id_and_status_and_clears_at", (q) =>
      q
        .eq("affiliateProfileId", profile._id)
        .eq("status", "pending")
        .lte("clearsAt", nowIso()),
    )
    .take(DASHBOARD_ELIGIBLE_PENDING_LIMIT);
  const eligibleCents = eligibleCommissions
    .reduce((total, commission) => total + commission.commissionCents, 0);

  return {
    clicks: stats.clickCount,
    referrals: stats.referralCount,
    conversions: stats.conversionCount,
    pendingCents: Math.max(0, stats.pendingCommissionCents - eligibleCents),
    eligibleCents,
    paidCents: stats.paidCommissionCents,
  };
}

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const profile = await getProfileForUser(ctx, user._id);
    if (!profile) {
      return {
        profile: null,
        referralUrl: null,
        terms: {
          commissionRate: COMMISSION_RATE,
          commissionMonths: COMMISSION_MONTHS,
          holdDays: HOLD_DAYS,
          minimumPayoutCents: MIN_PAYOUT_CENTS,
          currency: DEFAULT_CURRENCY,
        },
        stats: {
          clicks: 0,
          referrals: 0,
          conversions: 0,
          pendingCents: 0,
          eligibleCents: 0,
          paidCents: 0,
        },
      };
    }

    const stats = await getDashboardStats(ctx, profile);

    return {
      profile: {
        referralCode: profile.referralCode,
        status: profile.status,
        paypalEmail: profile.paypalEmail ?? null,
        createdAt: profile.createdAt,
      },
      referralUrl: `${APP_SIGNUP_URL}?via=${encodeURIComponent(profile.referralCode)}`,
      terms: {
        commissionRate: COMMISSION_RATE,
        commissionMonths: COMMISSION_MONTHS,
        holdDays: HOLD_DAYS,
        minimumPayoutCents: MIN_PAYOUT_CENTS,
        currency: DEFAULT_CURRENCY,
      },
      stats,
    };
  },
});

export const listCommissions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const profile = await getProfileForUser(ctx, user._id);
    if (!profile) {
      return [];
    }
    const commissions = await ctx.db
      .query("affiliate_commissions")
      .withIndex("by_affiliate_profile_id_and_occurred_at", (q) =>
        q.eq("affiliateProfileId", profile._id),
      )
      .order("desc")
      .take(100);

    return commissions
      .map((commission) => ({
        id: commission._id,
        amountCents: commission.amountCents,
        commissionCents: commission.commissionCents,
        currency: commission.currency,
        status: commission.status,
        occurredAt: commission.occurredAt,
        clearsAt: commission.clearsAt,
      }));
  },
});

export const listPayouts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const profile = await getProfileForUser(ctx, user._id);
    if (!profile) {
      return [];
    }
    const items = await ctx.db
      .query("affiliate_payout_items")
      .withIndex("by_affiliate_profile_id_and_created_at", (q) =>
        q.eq("affiliateProfileId", profile._id),
      )
      .order("desc")
      .take(50);

    return items
      .map((item) => ({
        id: item._id,
        amountCents: item.amountCents,
        currency: item.currency,
        status: item.status,
        paypalEmail: item.paypalEmail,
        createdAt: item.createdAt,
        paidAt: item.paidAt ?? null,
        externalReference: item.externalReference ?? null,
      }));
  },
});

export const activate = observedMutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const existing = await getProfileForUser(ctx, user._id);
    if (existing) {
      return existing._id;
    }
    const createdAt = nowIso();
    const profileId = await ctx.db.insert("affiliate_profiles", {
      userId: user._id,
      referralCode: await generateReferralCode(ctx, user),
      status: "active",
      createdAt,
      updatedAt: createdAt,
    });
    await ensureStatsForProfile(ctx, profileId);
    return profileId;
  },
});

export const updatePaypalEmail = observedMutation({
  args: {
    paypalEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const profile = await getProfileForUser(ctx, user._id);
    if (!profile) {
      throw new Error("Affiliate profile is not ready yet.");
    }
    const paypalEmail = normalizeEmail(args.paypalEmail);
    assertLooksLikeEmail(paypalEmail);
    const updatedAt = nowIso();
    await ctx.db.patch(profile._id, {
      paypalEmail,
      updatedAt,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.affiliates.reopenDeferredCommissionsForProfile,
      {
        affiliateProfileId: profile._id,
        updatedAt,
      },
    );
    return null;
  },
});

export const reopenDeferredCommissionsForProfile = observedInternalMutation({
  args: {
    affiliateProfileId: v.id("affiliate_profiles"),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const deferredCommissions = await ctx.db
      .query("affiliate_commissions")
      .withIndex("by_affiliate_profile_id_and_status_and_payout_state", (q) =>
        q
          .eq("affiliateProfileId", args.affiliateProfileId)
          .eq("status", "pending")
          .eq("payoutState", "deferred"),
      )
      .take(DEFERRED_PAYOUT_REOPEN_LIMIT);
    for (const commission of deferredCommissions) {
      await ctx.db.patch(commission._id, {
        payoutState: "unassigned",
        updatedAt: args.updatedAt,
      });
    }
    if (deferredCommissions.length === DEFERRED_PAYOUT_REOPEN_LIMIT) {
      await ctx.scheduler.runAfter(
        0,
        internal.affiliates.reopenDeferredCommissionsForProfile,
        args,
      );
    }
    return null;
  },
});

export const recordClick = observedMutation({
  args: {
    referralCode: v.string(),
    visitorId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const referralCode = normalizeReferralCode(args.referralCode);
    const profile = await getProfileByReferralCode(ctx, referralCode);
    if (!profile || profile.status !== "active") {
      return null;
    }
    await ctx.db.insert("affiliate_clicks", {
      affiliateProfileId: profile._id,
      referralCode,
      ...(args.visitorId ? { visitorId: args.visitorId } : {}),
      ...(args.sourceUrl
        ? { sourceUrl: redactSensitiveUrlValue(args.sourceUrl).slice(0, 500) }
        : {}),
      clickedAt: nowIso(),
    });
    await adjustStatsForProfile(ctx, profile._id, { clickCount: 1 });
    return null;
  },
});

export const bindAttribution = observedMutation({
  args: {
    businessId: v.id("businesses"),
    referralCode: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await requireTenantAdminMembership(ctx, args.businessId);
    const referralCode = normalizeReferralCode(args.referralCode);
    const profile = await getProfileByReferralCode(ctx, referralCode);
    if (!profile || profile.status !== "active") {
      return { bound: false, reason: "not_found" };
    }
    const business = await ctx.db.get(args.businessId);
    if (!business || !isKnownOnboardingStage(business.onboardingStage)) {
      return { bound: false, reason: "ineligible_business" };
    }
    if (
      ONBOARDING_STAGE_INDEX[business.onboardingStage] <
      ONBOARDING_STAGE_INDEX.attribution
    ) {
      return { bound: false, reason: "pending_onboarding" };
    }
    if (business.onboardingStage !== "attribution") {
      return { bound: false, reason: "ineligible_business" };
    }
    if (profile.userId === user._id) {
      return { bound: false, reason: "self_referral" };
    }
    const existing = await getAttributionForBusiness(ctx, args.businessId);
    if (existing) {
      return { bound: false, reason: "already_attributed" };
    }
    await createAttributionForBusiness(ctx, {
      affiliateProfileId: profile._id,
      businessId: args.businessId,
      referredUserId: user._id,
      referralCode,
    });
    return { bound: true, reason: "bound" };
  },
});

export const resolveCheckoutReferralDiscount = observedInternalMutation({
  args: {
    businessId: v.id("businesses"),
    referralCode: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      referralCode: v.string(),
      affiliateProfileId: v.id("affiliate_profiles"),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await requireTenantAdminMembership(ctx, args.businessId);

    const existing = await getAttributionForBusiness(ctx, args.businessId);
    if (existing) {
      const referralCode = existing.referralCode;
      const profile = await getProfileByReferralCode(ctx, referralCode);
      if (!profile || profile.status !== "active" || profile.userId === user._id) {
        return null;
      }
      return {
        referralCode,
        affiliateProfileId: profile._id,
      };
    }

    const referralCode = normalizeReferralCode(args.referralCode ?? "");
    if (!referralCode) {
      return null;
    }

    const profile = await getProfileByReferralCode(ctx, referralCode);
    if (!profile || profile.status !== "active" || profile.userId === user._id) {
      return null;
    }

    const business = await ctx.db.get(args.businessId);
    if (!business || !isKnownOnboardingStage(business.onboardingStage)) {
      return null;
    }

    if (ONBOARDING_STAGE_INDEX[business.onboardingStage] > ONBOARDING_STAGE_INDEX.attribution) {
      return null;
    }

    await createAttributionForBusiness(ctx, {
      affiliateProfileId: profile._id,
      businessId: args.businessId,
      referredUserId: user._id,
      referralCode,
    });

    return {
      referralCode,
      affiliateProfileId: profile._id,
    };
  },
});

export const createCommissionForBillingTransaction = observedInternalMutation({
  args: {
    billingTransactionId: v.id("billing_transactions"),
    businessId: v.id("businesses"),
    kind: v.string(),
    sourceId: v.string(),
    status: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    orderId: v.optional(v.string()),
    occurredAt: v.string(),
  },
  handler: async (ctx, args) => {
    const timestamp = nowIso();

    async function voidCommissionForSourceKey(
      sourceKey: string,
      reason: string,
    ): Promise<void> {
      await recordVoidedSource(ctx, {
        sourceKey,
        businessId: args.businessId,
        billingTransactionId: args.billingTransactionId,
        amountCents: args.amountCents,
        currency: args.currency,
        status: args.status,
        reason,
        voidedAt: timestamp,
      });
      const existing = await ctx.db
        .query("affiliate_commissions")
        .withIndex("by_source_key", (q) => q.eq("sourceKey", sourceKey))
        .unique();
      if (!existing || existing.status === "paid" || existing.status === "voided") {
        return;
      }
      if (existing.payoutItemId) {
        await adjustUnpaidPayoutItemAmount(
          ctx,
          existing.payoutItemId,
          -existing.commissionCents,
          timestamp,
          "voided",
        );
      }
      await ctx.db.patch(existing._id, {
        status: "voided",
        payoutItemId: undefined,
        payoutState: "voided",
        voidedAt: timestamp,
        voidReason: reason,
        updatedAt: timestamp,
      });
      if (existing.status === "pending") {
        await adjustStatsForProfile(ctx, existing.affiliateProfileId, {
          conversionCount: -1,
          pendingCommissionCents: -existing.commissionCents,
        });
      }
    }

    async function reduceCommissionForSourceKey(sourceKey: string): Promise<void> {
      const refundSourceKey = `refund:${args.sourceId}`;
      const existingRefund = await getVoidedSourceBySourceKey(ctx, refundSourceKey);
      if (existingRefund) {
        return;
      }
      await recordVoidedSource(ctx, {
        sourceKey: refundSourceKey,
        businessId: args.businessId,
        billingTransactionId: args.billingTransactionId,
        amountCents: args.amountCents,
        currency: args.currency,
        status: args.status,
        reason: "refund",
        voidedAt: timestamp,
      });
      await recordVoidedSource(ctx, {
        sourceKey,
        businessId: args.businessId,
        billingTransactionId: args.billingTransactionId,
        amountCents: args.amountCents,
        currency: args.currency,
        status: args.status,
        reason: "refund",
        voidedAt: timestamp,
      });

      const existing = await ctx.db
        .query("affiliate_commissions")
        .withIndex("by_source_key", (q) => q.eq("sourceKey", sourceKey))
        .unique();
      if (!existing) {
        return;
      }
      if (existing.status === "paid" || existing.status === "voided") {
        return;
      }

      const commissionReductionCents = Math.min(
        existing.commissionCents,
        centsForCommission(args.amountCents),
      );
      if (commissionReductionCents <= 0) {
        return;
      }
      if (commissionReductionCents >= existing.commissionCents) {
        await voidCommissionForSourceKey(sourceKey, "refund");
        return;
      }

      const nextCommissionCents = existing.commissionCents - commissionReductionCents;
      const nextAmountCents = Math.max(0, existing.amountCents - args.amountCents);
      if (existing.payoutItemId) {
        await adjustUnpaidPayoutItemAmount(
          ctx,
          existing.payoutItemId,
          -commissionReductionCents,
          timestamp,
          "voided",
        );
      }
      await ctx.db.patch(existing._id, {
        amountCents: nextAmountCents,
        commissionCents: nextCommissionCents,
        updatedAt: timestamp,
      });
      if (existing.status === "pending") {
        await adjustStatsForProfile(ctx, existing.affiliateProfileId, {
          conversionCount: 0,
          pendingCommissionCents: -commissionReductionCents,
        });
      }
    }

    if (args.kind === "refund") {
      if (!args.orderId) {
        return null;
      }
      if (!VOID_REFUND_STATUSES.has(args.status.toLowerCase())) {
        return null;
      }
      await reduceCommissionForSourceKey(`order:${args.orderId}`);
      return null;
    }

    if (args.kind === "order" && VOID_ORDER_STATUSES.has(args.status.toLowerCase())) {
      await voidCommissionForSourceKey(`order:${args.sourceId}`, args.status.toLowerCase());
      return null;
    }

    if (args.kind !== "order" || !PAID_ORDER_STATUSES.has(args.status)) {
      return null;
    }

    const attribution = await getAttributionForBusiness(ctx, args.businessId);
    if (!attribution) {
      return null;
    }

    if (args.occurredAt > addMonthsIso(attribution.attributedAt, COMMISSION_MONTHS)) {
      return null;
    }

    const commissionCents = centsForCommission(args.amountCents);
    if (commissionCents <= 0) {
      return null;
    }

    const sourceKey = `order:${args.sourceId}`;
    const voidedSource = await getVoidedSourceBySourceKey(ctx, sourceKey);
    if (voidedSource) {
      return null;
    }
    const existing = await ctx.db
      .query("affiliate_commissions")
      .withIndex("by_source_key", (q) => q.eq("sourceKey", sourceKey))
      .unique();

    const patch = {
      affiliateProfileId: attribution.affiliateProfileId,
      referredBusinessId: args.businessId,
      sourceKey,
      billingTransactionId: args.billingTransactionId,
      amountCents: args.amountCents,
      commissionCents,
      currency: args.currency.toLowerCase(),
      status: "pending",
      occurredAt: args.occurredAt,
      clearsAt: addDaysIso(args.occurredAt, HOLD_DAYS),
      updatedAt: timestamp,
    };

    if (existing) {
      if (existing.status === "paid" || existing.status === "voided") {
        return null;
      }
      const nextPayoutState = existing.payoutState;
      const amountDeltaCents = commissionCents - existing.commissionCents;
      if (existing.payoutItemId && amountDeltaCents !== 0) {
        await adjustUnpaidPayoutItemAmount(
          ctx,
          existing.payoutItemId,
          amountDeltaCents,
          timestamp,
          "draft",
        );
      }
      await ctx.db.patch(existing._id, {
        ...patch,
        payoutState: nextPayoutState,
        ...(existing.payoutItemId ? { payoutItemId: existing.payoutItemId } : {}),
      });
      await adjustStatsForProfile(ctx, attribution.affiliateProfileId, {
        conversionCount: existing.status === "pending" ? 0 : 1,
        pendingCommissionCents:
          commissionCents - (existing.status === "pending" ? existing.commissionCents : 0),
      });
      return null;
    }

    await ctx.db.insert("affiliate_commissions", {
      ...patch,
      payoutState: "unassigned",
      createdAt: timestamp,
    });
    await adjustStatsForProfile(ctx, attribution.affiliateProfileId, {
      conversionCount: 1,
      pendingCommissionCents: commissionCents,
    });
    return null;
  },
});

async function releaseBelowMinimumDraftPayoutItems(
  ctx: MutationCtx,
  payoutRunId: Id<"affiliate_payout_runs">,
  updatedAt: string,
): Promise<boolean> {
  const draftItems = await ctx.db
    .query("affiliate_payout_items")
    .withIndex("by_payout_run_id_and_status", (q) =>
      q.eq("payoutRunId", payoutRunId).eq("status", "draft"),
    )
    .take(PAYOUT_RUN_ITEM_LIMIT);

  for (const item of draftItems) {
    if (item.amountCents >= MIN_PAYOUT_CENTS) {
      continue;
    }
    const assignedCommissions = await ctx.db
      .query("affiliate_commissions")
      .withIndex("by_payout_item_id_and_payout_state", (q) =>
        q.eq("payoutItemId", item._id).eq("payoutState", "assigned"),
      )
      .take(PAYOUT_RUN_COMMISSION_LIMIT + 1);
    for (const commission of assignedCommissions.slice(
      0,
      PAYOUT_RUN_COMMISSION_LIMIT,
    )) {
      await ctx.db.patch(commission._id, {
        payoutItemId: undefined,
        payoutState: "unassigned",
        updatedAt,
      });
    }
    if (assignedCommissions.length > PAYOUT_RUN_COMMISSION_LIMIT) {
      return true;
    }
    await ctx.db.delete(item._id);
  }
  return draftItems.length === PAYOUT_RUN_ITEM_LIMIT;
}

export const releaseBelowMinimumDraftPayoutItemsForRun = observedInternalMutation({
  args: {
    payoutRunId: v.id("affiliate_payout_runs"),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const needsMoreCleanup = await releaseBelowMinimumDraftPayoutItems(
      ctx,
      args.payoutRunId,
      args.updatedAt,
    );
    if (needsMoreCleanup) {
      await ctx.scheduler.runAfter(
        0,
        internal.affiliates.releaseBelowMinimumDraftPayoutItemsForRun,
        args,
      );
    }
    return null;
  },
});

export const generateMonthlyPayoutRun = observedInternalMutation({
  args: {
    periodKey: v.optional(v.string()),
    createdAt: v.optional(v.string()),
    payoutRunId: v.optional(v.id("affiliate_payout_runs")),
  },
  handler: async (ctx, args) => {
    const createdAt = args.createdAt ?? nowIso();
    const periodKey = args.periodKey ?? previousMonthKey(new Date(createdAt));
    const existingRun = args.payoutRunId
      ? await ctx.db.get(args.payoutRunId)
      : await ctx.db
          .query("affiliate_payout_runs")
          .withIndex("by_period_key", (q) => q.eq("periodKey", periodKey))
          .unique();
    if (existingRun?.status === "paid") {
      return existingRun._id;
    }

    const payoutRunId =
      existingRun?._id ??
      await ctx.db.insert("affiliate_payout_runs", {
        periodKey,
        status: "draft",
        totalCents: 0,
        currency: DEFAULT_CURRENCY,
        createdAt,
        updatedAt: createdAt,
      });

    const eligibleCommissions = await ctx.db
      .query("affiliate_commissions")
      .withIndex("by_status_and_payout_state_and_clears_at", (q) =>
        q
          .eq("status", "pending")
          .eq("payoutState", "unassigned")
          .lte("clearsAt", createdAt),
      )
      .take(PAYOUT_RUN_COMMISSION_LIMIT);
    if (eligibleCommissions.length === 0) {
      const needsMoreCleanup = await releaseBelowMinimumDraftPayoutItems(
        ctx,
        payoutRunId,
        createdAt,
      );
      if (needsMoreCleanup) {
        await ctx.scheduler.runAfter(
          0,
          internal.affiliates.releaseBelowMinimumDraftPayoutItemsForRun,
          {
            payoutRunId,
            updatedAt: createdAt,
          },
        );
      }
      return payoutRunId;
    }
    const commissions = eligibleCommissions;

    const byAffiliate = new Map<Id<"affiliate_profiles">, Doc<"affiliate_commissions">[]>();
    for (const commission of commissions) {
      if (commission.currency !== DEFAULT_CURRENCY) {
        await ctx.db.patch(commission._id, {
          payoutState: "deferred",
          updatedAt: createdAt,
        });
        continue;
      }
      if (commission.payoutItemId) {
        await ctx.db.patch(commission._id, {
          payoutState: "assigned",
          updatedAt: createdAt,
        });
        continue;
      }
      const profile = await ctx.db.get(commission.affiliateProfileId);
      if (!profile?.paypalEmail || profile.status !== "active") {
        await ctx.db.patch(commission._id, {
          payoutState: "deferred",
          updatedAt: createdAt,
        });
        continue;
      }
      const current = byAffiliate.get(commission.affiliateProfileId) ?? [];
      current.push(commission);
      byAffiliate.set(commission.affiliateProfileId, current);
    }

    const eligibleGroups: Array<{
      profile: Doc<"affiliate_profiles">;
      user: Doc<"users"> | null;
      commissions: Doc<"affiliate_commissions">[];
      amountCents: number;
    }> = [];

    for (const [affiliateProfileId, groupCommissions] of byAffiliate) {
      const amountCents = groupCommissions.reduce(
        (total, commission) => total + commission.commissionCents,
        0,
      );
      const profile = await ctx.db.get(affiliateProfileId);
      if (!profile?.paypalEmail || profile.status !== "active") {
        continue;
      }
      eligibleGroups.push({
        profile,
        user: await ctx.db.get(profile.userId),
        commissions: groupCommissions,
        amountCents,
      });
    }

    for (const group of eligibleGroups) {
      const existingItem = await ctx.db
        .query("affiliate_payout_items")
        .withIndex("by_payout_run_id_and_affiliate_profile_id", (q) =>
          q.eq("payoutRunId", payoutRunId).eq("affiliateProfileId", group.profile._id),
        )
        .unique();
      const previousAmountCents = existingItem?.amountCents ?? 0;
      const nextAmountCents = previousAmountCents + group.amountCents;
      const previousReadyCents =
        existingItem && existingItem.status === "ready" ? previousAmountCents : 0;
      const nextStatus = nextAmountCents >= MIN_PAYOUT_CENTS ? "ready" : "draft";
      const nextReadyCents = nextStatus === "ready" ? nextAmountCents : 0;
      const payoutItemId =
        existingItem?._id ??
        await ctx.db.insert("affiliate_payout_items", {
          payoutRunId,
          affiliateProfileId: group.profile._id,
          amountCents: 0,
          currency: DEFAULT_CURRENCY,
          status: "draft",
          paypalEmail: group.profile.paypalEmail!,
          ...(group.user?.email ? { affiliateEmail: group.user.email } : {}),
          ...(group.user?.displayName ?? group.user?.name
            ? { affiliateName: group.user?.displayName ?? group.user?.name }
            : {}),
          createdAt,
          updatedAt: createdAt,
        });

      await ctx.db.patch(payoutItemId, {
        amountCents: nextAmountCents,
        status: nextStatus,
        paypalEmail: group.profile.paypalEmail!,
        updatedAt: createdAt,
      });

      for (const commission of group.commissions) {
        await ctx.db.patch(commission._id, {
          payoutItemId,
          payoutState: "assigned",
          updatedAt: createdAt,
        });
      }

      const totalDeltaCents = nextReadyCents - previousReadyCents;
      if (totalDeltaCents !== 0) {
        const payoutRun = await ctx.db.get(payoutRunId);
        if (payoutRun) {
          await ctx.db.patch(payoutRunId, {
            totalCents: Math.max(0, payoutRun.totalCents + totalDeltaCents),
            updatedAt: createdAt,
          });
        }
      }
    }

    if (eligibleCommissions.length === PAYOUT_RUN_COMMISSION_LIMIT) {
      await ctx.scheduler.runAfter(0, internal.affiliates.generateMonthlyPayoutRun, {
        periodKey,
        createdAt,
        payoutRunId,
      });
    } else {
      const needsMoreCleanup = await releaseBelowMinimumDraftPayoutItems(
        ctx,
        payoutRunId,
        createdAt,
      );
      if (needsMoreCleanup) {
        await ctx.scheduler.runAfter(
          0,
          internal.affiliates.releaseBelowMinimumDraftPayoutItemsForRun,
          {
            payoutRunId,
            updatedAt: createdAt,
          },
        );
      }
    }

    return payoutRunId;
  },
});

export const getPayoutRunPacket = internalQuery({
  args: {
    periodKey: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("affiliate_payout_runs")
      .withIndex("by_period_key", (q) => q.eq("periodKey", args.periodKey))
      .unique();
    if (!run) {
      return null;
    }
    const items = await ctx.db
      .query("affiliate_payout_items")
      .withIndex("by_payout_run_id", (q) => q.eq("payoutRunId", run._id))
      .take(PAYOUT_RUN_ITEM_LIMIT + 1);
    const packetItems = items.slice(0, PAYOUT_RUN_ITEM_LIMIT);

    return {
      periodKey: run.periodKey,
      status: run.status,
      totalCents: run.totalCents,
      currency: run.currency,
      createdAt: run.createdAt,
      hasMoreItems: items.length > PAYOUT_RUN_ITEM_LIMIT,
      items: packetItems.map((item) => ({
        payoutItemId: item._id,
        affiliateProfileId: item.affiliateProfileId,
        affiliateName: item.affiliateName ?? null,
        affiliateEmail: item.affiliateEmail ?? null,
        paypalEmail: item.paypalEmail,
        amountCents: item.amountCents,
        currency: item.currency,
        status: item.status,
        externalReference: item.externalReference ?? null,
        paidAt: item.paidAt ?? null,
      })),
    };
  },
});

export const markPayoutItemPaid = observedInternalMutation({
  args: {
    payoutItemId: v.id("affiliate_payout_items"),
    externalReference: v.optional(v.string()),
    note: v.optional(v.string()),
    paidAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const paidAt = args.paidAt ?? nowIso();
    const payoutItem = await ctx.db.get(args.payoutItemId);
    if (!payoutItem) {
      throw new Error("Payout item not found.");
    }

    await ctx.db.patch(payoutItem._id, {
      status: "paid",
      paidAt,
      updatedAt: paidAt,
      ...(args.externalReference ? { externalReference: args.externalReference } : {}),
      ...(args.note ? { note: args.note } : {}),
    });

    const assignedCommissions = await ctx.db
      .query("affiliate_commissions")
      .withIndex("by_payout_item_id_and_payout_state", (q) =>
        q.eq("payoutItemId", payoutItem._id).eq("payoutState", "assigned"),
      )
      .take(PAYOUT_RUN_COMMISSION_LIMIT);
    for (const commission of assignedCommissions) {
      if (commission.status === "voided") {
        continue;
      }
      await ctx.db.patch(commission._id, {
        status: "paid",
        paidAt,
        payoutItemId: payoutItem._id,
        payoutState: "paid",
        updatedAt: paidAt,
      });
      if (commission.status !== "paid") {
        await adjustStatsForProfile(ctx, commission.affiliateProfileId, {
          pendingCommissionCents:
            commission.status === "pending" ? -commission.commissionCents : 0,
          paidCommissionCents: commission.commissionCents,
        });
      }
    }
    if (assignedCommissions.length === PAYOUT_RUN_COMMISSION_LIMIT) {
      await ctx.scheduler.runAfter(0, internal.affiliates.markPayoutItemPaid, args);
      return null;
    }

    const readySiblingItems = await ctx.db
      .query("affiliate_payout_items")
      .withIndex("by_payout_run_id_and_status", (q) =>
        q.eq("payoutRunId", payoutItem.payoutRunId).eq("status", "ready"),
      )
      .take(1);
    const draftSiblingItems = await ctx.db
      .query("affiliate_payout_items")
      .withIndex("by_payout_run_id_and_status", (q) =>
        q.eq("payoutRunId", payoutItem.payoutRunId).eq("status", "draft"),
      )
      .take(1);
    if (readySiblingItems.length === 0 && draftSiblingItems.length === 0) {
      await ctx.db.patch(payoutItem.payoutRunId, {
        status: "paid",
        updatedAt: paidAt,
      });
    }

    return null;
  },
});
