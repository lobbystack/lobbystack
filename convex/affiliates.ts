import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireCurrentUser, requireMembership } from "./lib/auth";
import {
  observedInternalMutation,
  observedMutation,
} from "./telemetry/observedFunctions";

const COMMISSION_RATE = 0.2;
const COMMISSION_MONTHS = 12;
const HOLD_DAYS = 30;
const MIN_PAYOUT_CENTS = 10_000;
const DEFAULT_CURRENCY = "usd";

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
    .slice(0, 32);
}

function referralCodeBaseForUser(user: Doc<"users">): string {
  const preferred =
    user.displayName ??
    user.name ??
    user.email?.split("@")[0] ??
    `user-${String(user._id).slice(-8)}`;
  return normalizeReferralCode(preferred) || `user-${String(user._id).slice(-8)}`;
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
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await getProfileByReferralCode(ctx, candidate);
    if (!existing) {
      return candidate;
    }
  }
  return `${base}-${String(user._id).slice(-8)}`;
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

    const [clicks, attributions, commissions, payoutItems] = await Promise.all([
      ctx.db
        .query("affiliate_clicks")
        .withIndex("by_affiliate_profile_id_and_clicked_at", (q) =>
          q.eq("affiliateProfileId", profile._id),
        )
        .collect(),
      ctx.db
        .query("affiliate_attributions")
        .withIndex("by_affiliate_profile_id_and_attributed_at", (q) =>
          q.eq("affiliateProfileId", profile._id),
        )
        .collect(),
      ctx.db
        .query("affiliate_commissions")
        .withIndex("by_affiliate_profile_id_and_status", (q) =>
          q.eq("affiliateProfileId", profile._id),
        )
        .collect(),
      ctx.db
        .query("affiliate_payout_items")
        .withIndex("by_affiliate_profile_id_and_created_at", (q) =>
          q.eq("affiliateProfileId", profile._id),
        )
        .collect(),
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
      profile: {
        referralCode: profile.referralCode,
        status: profile.status,
        paypalEmail: profile.paypalEmail ?? null,
        createdAt: profile.createdAt,
      },
      referralUrl: `https://www.lobbystack.com/?via=${encodeURIComponent(profile.referralCode)}`,
      terms: {
        commissionRate: COMMISSION_RATE,
        commissionMonths: COMMISSION_MONTHS,
        holdDays: HOLD_DAYS,
        minimumPayoutCents: MIN_PAYOUT_CENTS,
        currency: DEFAULT_CURRENCY,
      },
      stats: {
        clicks: clicks.length,
        referrals: attributions.length,
        conversions: commissions.filter((commission) => commission.status !== "voided")
          .length,
        pendingCents,
        eligibleCents,
        paidCents:
          paidCents +
          payoutItems
            .filter((item) => item.status === "paid")
            .reduce((total, item) => total + item.amountCents, 0),
      },
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
      .withIndex("by_affiliate_profile_id_and_status", (q) =>
        q.eq("affiliateProfileId", profile._id),
      )
      .collect();

    return commissions
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 100)
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
      .collect();

    return items
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
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
    return await ctx.db.insert("affiliate_profiles", {
      userId: user._id,
      referralCode: await generateReferralCode(ctx, user),
      status: "active",
      createdAt,
      updatedAt: createdAt,
    });
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
    await requireMembership(ctx, args.businessId);
    const referralCode = normalizeReferralCode(args.referralCode);
    const profile = await getProfileByReferralCode(ctx, referralCode);
    if (!profile || profile.status !== "active") {
      return { bound: false, reason: "not_found" };
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
        await ctx.db.patch(existing._id, {
          status: "voided",
          voidedAt: timestamp,
          voidReason: "refund",
          updatedAt: timestamp,
        });
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
      if (existing.status === "paid") {
        return null;
      }
      await ctx.db.patch(existing._id, patch);
      return null;
    }

    await ctx.db.insert("affiliate_commissions", {
      ...patch,
      createdAt: timestamp,
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
