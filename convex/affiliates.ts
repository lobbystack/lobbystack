import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireCurrentUser, requireTenantAdminMembership } from "./lib/auth";
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

const PAID_ORDER_STATUSES = new Set(["paid", "completed", "succeeded"]);

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

async function getAttributionForBusiness(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  businessId: Id<"businesses">,
): Promise<Doc<"affiliate_attributions"> | null> {
  return await ctx.db
    .query("affiliate_attributions")
    .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
    .unique();
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
      throw new Error("Activate your affiliate profile first.");
    }
    const paypalEmail = normalizeEmail(args.paypalEmail);
    assertLooksLikeEmail(paypalEmail);
    await ctx.db.patch(profile._id, {
      paypalEmail,
      updatedAt: nowIso(),
    });
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
      ...(args.sourceUrl ? { sourceUrl: args.sourceUrl.slice(0, 500) } : {}),
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
    if (!business || business.onboardingStage === "completed") {
      return { bound: false, reason: "ineligible_business" };
    }
    if (profile.userId === user._id) {
      return { bound: false, reason: "self_referral" };
    }
    const existing = await getAttributionForBusiness(ctx, args.businessId);
    if (existing) {
      return { bound: false, reason: "already_attributed" };
    }
    await ctx.db.insert("affiliate_attributions", {
      affiliateProfileId: profile._id,
      businessId: args.businessId,
      referredUserId: user._id,
      referralCode,
      source: "via",
      attributedAt: nowIso(),
    });
    await adjustStatsForProfile(ctx, profile._id, { referralCount: 1 });
    return { bound: true, reason: "bound" };
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

    if (args.kind === "refund") {
      if (!args.orderId) {
        return null;
      }
      const sourceKey = `order:${args.orderId}`;
      const existing = await ctx.db
        .query("affiliate_commissions")
        .withIndex("by_source_key", (q) => q.eq("sourceKey", sourceKey))
        .unique();
      if (existing && existing.status !== "paid") {
        if (existing.payoutItemId) {
          const payoutItem = await ctx.db.get(existing.payoutItemId);
          if (payoutItem && payoutItem.status !== "paid") {
            const nextCommissionIds = payoutItem.commissionIds.filter(
              (commissionId) => commissionId !== existing._id,
            );
            const nextAmountCents = Math.max(
              0,
              payoutItem.amountCents - existing.commissionCents,
            );
            await ctx.db.patch(payoutItem._id, {
              amountCents: nextAmountCents,
              commissionIds: nextCommissionIds,
              status: nextCommissionIds.length === 0 ? "voided" : payoutItem.status,
              updatedAt: timestamp,
            });

            const payoutRun = await ctx.db.get(payoutItem.payoutRunId);
            if (payoutRun && payoutRun.status !== "paid") {
              await ctx.db.patch(payoutRun._id, {
                totalCents: Math.max(
                  0,
                  payoutRun.totalCents - existing.commissionCents,
                ),
                updatedAt: timestamp,
              });
            }
          }
        }
        await ctx.db.patch(existing._id, {
          status: "voided",
          payoutItemId: undefined,
          voidedAt: timestamp,
          voidReason: "refund",
          updatedAt: timestamp,
        });
        if (existing.status === "pending") {
          await adjustStatsForProfile(ctx, existing.affiliateProfileId, {
            conversionCount: -1,
            pendingCommissionCents: -existing.commissionCents,
          });
        }
      }
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
      await ctx.db.patch(existing._id, patch);
      await adjustStatsForProfile(ctx, attribution.affiliateProfileId, {
        conversionCount: existing.status === "pending" ? 0 : 1,
        pendingCommissionCents:
          commissionCents - (existing.status === "pending" ? existing.commissionCents : 0),
      });
      return null;
    }

    await ctx.db.insert("affiliate_commissions", {
      ...patch,
      createdAt: timestamp,
    });
    await adjustStatsForProfile(ctx, attribution.affiliateProfileId, {
      conversionCount: 1,
      pendingCommissionCents: commissionCents,
    });
    return null;
  },
});

export const generateMonthlyPayoutRun = observedInternalMutation({
  args: {
    periodKey: v.optional(v.string()),
    createdAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const createdAt = args.createdAt ?? nowIso();
    const periodKey = args.periodKey ?? previousMonthKey(new Date(createdAt));
    const existingRun = await ctx.db
      .query("affiliate_payout_runs")
      .withIndex("by_period_key", (q) => q.eq("periodKey", periodKey))
      .unique();
    if (existingRun) {
      return existingRun._id;
    }

    const commissions = await ctx.db
      .query("affiliate_commissions")
      .withIndex("by_status_and_clears_at", (q) =>
        q.eq("status", "pending").lte("clearsAt", createdAt),
      )
      .collect();

    const byAffiliate = new Map<Id<"affiliate_profiles">, Doc<"affiliate_commissions">[]>();
    for (const commission of commissions) {
      if (commission.currency !== DEFAULT_CURRENCY || commission.payoutItemId) {
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
      if (amountCents < MIN_PAYOUT_CENTS) {
        continue;
      }
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

    const totalCents = eligibleGroups.reduce((total, group) => total + group.amountCents, 0);
    const payoutRunId = await ctx.db.insert("affiliate_payout_runs", {
      periodKey,
      status: "draft",
      totalCents,
      currency: DEFAULT_CURRENCY,
      createdAt,
      updatedAt: createdAt,
    });

    for (const group of eligibleGroups) {
      const payoutItemId = await ctx.db.insert("affiliate_payout_items", {
        payoutRunId,
        affiliateProfileId: group.profile._id,
        amountCents: group.amountCents,
        currency: DEFAULT_CURRENCY,
        status: "ready",
        paypalEmail: group.profile.paypalEmail!,
        ...(group.user?.email ? { affiliateEmail: group.user.email } : {}),
        ...(group.user?.displayName ?? group.user?.name
          ? { affiliateName: group.user?.displayName ?? group.user?.name }
          : {}),
        commissionIds: group.commissions.map((commission) => commission._id),
        createdAt,
        updatedAt: createdAt,
      });

      for (const commission of group.commissions) {
        await ctx.db.patch(commission._id, {
          payoutItemId,
          updatedAt: createdAt,
        });
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
      .collect();

    return {
      periodKey: run.periodKey,
      status: run.status,
      totalCents: run.totalCents,
      currency: run.currency,
      createdAt: run.createdAt,
      items: items.map((item) => ({
        payoutItemId: item._id,
        affiliateProfileId: item.affiliateProfileId,
        affiliateName: item.affiliateName ?? null,
        affiliateEmail: item.affiliateEmail ?? null,
        paypalEmail: item.paypalEmail,
        amountCents: item.amountCents,
        currency: item.currency,
        status: item.status,
        commissionIds: item.commissionIds,
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

    for (const commissionId of payoutItem.commissionIds) {
      const commission = await ctx.db.get(commissionId);
      if (commission && commission.status !== "voided") {
        await ctx.db.patch(commissionId, {
          status: "paid",
          paidAt,
          payoutItemId: payoutItem._id,
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
    }

    const siblingItems = await ctx.db
      .query("affiliate_payout_items")
      .withIndex("by_payout_run_id", (q) => q.eq("payoutRunId", payoutItem.payoutRunId))
      .collect();
    if (siblingItems.length > 0 && siblingItems.every((item) => item._id === payoutItem._id || item.status === "paid")) {
      await ctx.db.patch(payoutItem.payoutRunId, {
        status: "paid",
        updatedAt: paidAt,
      });
    }

    return null;
  },
});
