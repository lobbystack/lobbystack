import { and, eq, inArray, lte, sql } from "drizzle-orm";

import { affiliateAttributions, affiliateClicks, affiliateCommissions, affiliatePayoutItems, affiliatePayoutRuns, affiliateProfileStats, affiliateProfiles, affiliateVoidedSources, billingTransactions, enqueueOutbox, users, withBusinessTransaction, withDispatcherTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";

const COMMISSION_RATE = 0.2;
const COMMISSION_MONTHS = 12;
const HOLD_DAYS = 30;
const MIN_PAYOUT_CENTS = 10_000;
const DEFAULT_CURRENCY = "usd";
const PAYOUT_BATCH_LIMIT = 250;
const PAID_ORDER_STATUSES = new Set(["paid", "completed", "succeeded"]);
const VOID_ORDER_STATUSES = new Set(["canceled", "cancelled", "refunded", "reversed"]);
const VOID_REFUND_STATUSES = new Set(["succeeded"]);

function centsForCommission(amountCents: number): number {
  return Math.max(0, Math.floor(amountCents * COMMISSION_RATE));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function previousMonthKey(date = new Date()): string {
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function createAffiliateProfile(
  context: DomainContext,
  input: { userId: string; referralCode: string; payoutEmail?: string },
): Promise<string> {
  return await withBusinessTransaction(context.db, { userId: input.userId, actorType: "system" }, async (tx) => {
    const [profile] = await tx.insert(affiliateProfiles).values({ userId: input.userId, referralCode: input.referralCode, ...(input.payoutEmail !== undefined ? { payoutEmail: input.payoutEmail } : {}) }).returning({ id: affiliateProfiles.id });
    if (!profile) throw new Error("Affiliate profile could not be created.");
    return profile.id;
  });
}

export async function attributeBusiness(
  context: DomainContext,
  input: { businessId: string; referredUserId: string; referralCode: string; source: string },
): Promise<string | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "system" }, async (tx) => {
    const profile = (await tx.select({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode }).from(affiliateProfiles).where(eq(affiliateProfiles.referralCode, input.referralCode)).limit(1))[0];
    if (!profile) return null;
    const [attribution] = await tx.insert(affiliateAttributions).values({ affiliateProfileId: profile.id, businessId: input.businessId, referredUserId: input.referredUserId, referralCode: profile.referralCode, source: input.source, attributedAt: new Date() }).onConflictDoNothing().returning({ id: affiliateAttributions.id });
    if (!attribution) return null;
    await tx.insert(affiliateProfileStats).values({ affiliateProfileId: profile.id, referralCount: 1 }).onConflictDoUpdate({ target: affiliateProfileStats.affiliateProfileId, set: { referralCount: sql`${affiliateProfileStats.referralCount} + 1`, updatedAt: new Date() } });
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "affiliate_attribution", aggregateId: attribution.id, dedupeKey: `affiliate:${attribution.id}:created`, payload: { type: "conversation.updated", entityId: attribution.id } });
    return attribution.id;
  });
}

export async function recordAffiliateClick(
  context: DomainContext,
  input: { referralCode: string; visitorId?: string; sourceUrl?: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => {
    const profile = (await tx.select({ id: affiliateProfiles.id, status: affiliateProfiles.status }).from(affiliateProfiles).where(eq(affiliateProfiles.referralCode, input.referralCode)).limit(1))[0];
    if (!profile || profile.status !== "active") return false;
    await tx.insert(affiliateClicks).values({ affiliateProfileId: profile.id, referralCode: input.referralCode, ...(input.visitorId ? { visitorId: input.visitorId } : {}), ...(input.sourceUrl ? { sourceUrl: input.sourceUrl.slice(0, 500) } : {}) });
    await tx.insert(affiliateProfileStats).values({ affiliateProfileId: profile.id, clickCount: 1 }).onConflictDoUpdate({ target: affiliateProfileStats.affiliateProfileId, set: { clickCount: sql`${affiliateProfileStats.clickCount} + 1`, updatedAt: new Date() } });
    return true;
  });
}

export type AffiliateTransactionInput = {
  businessId: string;
  billingTransactionId: string;
  kind: string;
  sourceId: string;
  status: string;
  amountCents: number;
  currency: string;
  orderId?: string;
  occurredAt: Date;
};

export async function recordAffiliateCommissionInTransaction(
  tx: DatabaseTransaction,
  input: AffiliateTransactionInput,
): Promise<string | null> {
  const normalizedStatus = input.status.toLowerCase();
  const sourceKey = input.kind === "order" ? `order:${input.sourceId}` : `${input.kind}:${input.sourceId}`;
  const attribution = (await tx.select({ profileId: affiliateAttributions.affiliateProfileId, attributedAt: affiliateAttributions.attributedAt }).from(affiliateAttributions).where(eq(affiliateAttributions.businessId, input.businessId)).limit(1))[0];
  const now = new Date();

  async function recordVoidedSource(voidedSourceKey: string, reason: string): Promise<void> {
    await tx.insert(affiliateVoidedSources).values({
      sourceKey: voidedSourceKey,
      businessId: input.businessId,
      billingTransactionId: input.billingTransactionId,
      amountCents: input.amountCents,
      currency: input.currency.toLowerCase(),
      status: normalizedStatus,
      reason,
      voidedAt: now,
    }).onConflictDoNothing({ target: affiliateVoidedSources.sourceKey });
  }

  async function adjustPayoutItem(payoutItemId: string, deltaCents: number): Promise<void> {
    const item = (await tx.select({ amountCents: affiliatePayoutItems.amountCents, status: affiliatePayoutItems.status }).from(affiliatePayoutItems).where(eq(affiliatePayoutItems.id, payoutItemId)).limit(1))[0];
    if (!item || item.status === "paid") return;
    const amountCents = Math.max(0, item.amountCents + deltaCents);
    await tx.update(affiliatePayoutItems).set({ amountCents, status: amountCents >= MIN_PAYOUT_CENTS ? "ready" : "draft", updatedAt: now }).where(eq(affiliatePayoutItems.id, payoutItemId));
  }

  async function voidCommission(voidedSourceKey: string, reason: string): Promise<string | null> {
    await recordVoidedSource(voidedSourceKey, reason);
    const existing = (await tx.select({ id: affiliateCommissions.id, profileId: affiliateCommissions.affiliateProfileId, status: affiliateCommissions.status, commissionCents: affiliateCommissions.commissionCents, payoutItemId: affiliateCommissions.payoutItemId }).from(affiliateCommissions).where(eq(affiliateCommissions.sourceKey, voidedSourceKey)).limit(1))[0];
    if (!existing || existing.status === "paid" || existing.status === "voided") return existing?.id ?? null;
    if (existing.payoutItemId) await adjustPayoutItem(existing.payoutItemId, -existing.commissionCents);
    await tx.update(affiliateCommissions).set({ status: "voided", payoutState: "voided", payoutItemId: null, voidedAt: now, voidReason: reason, updatedAt: now }).where(eq(affiliateCommissions.id, existing.id));
    if (existing.status === "pending") {
      await tx.update(affiliateProfileStats).set({ conversionCount: sql`greatest(0, ${affiliateProfileStats.conversionCount} - 1)`, pendingCommissionCents: sql`greatest(0, ${affiliateProfileStats.pendingCommissionCents} - ${existing.commissionCents})`, updatedAt: now }).where(eq(affiliateProfileStats.affiliateProfileId, existing.profileId));
    }
    return existing.id;
  }

  async function reduceCommission(orderSourceKey: string): Promise<string | null> {
    const existing = (await tx.select({ id: affiliateCommissions.id, profileId: affiliateCommissions.affiliateProfileId, status: affiliateCommissions.status, amountCents: affiliateCommissions.amountCents, commissionCents: affiliateCommissions.commissionCents, payoutItemId: affiliateCommissions.payoutItemId }).from(affiliateCommissions).where(eq(affiliateCommissions.sourceKey, orderSourceKey)).limit(1))[0];
    if (!existing || existing.status === "paid" || existing.status === "voided") return existing?.id ?? null;
    const commissionReductionCents = Math.min(existing.commissionCents, centsForCommission(input.amountCents));
    if (commissionReductionCents <= 0) return existing.id;
    if (commissionReductionCents >= existing.commissionCents) return await voidCommission(orderSourceKey, "refund");
    if (existing.payoutItemId) await adjustPayoutItem(existing.payoutItemId, -commissionReductionCents);
    await tx.update(affiliateCommissions).set({ amountCents: Math.max(0, existing.amountCents - input.amountCents), commissionCents: existing.commissionCents - commissionReductionCents, updatedAt: now }).where(eq(affiliateCommissions.id, existing.id));
    if (existing.status === "pending") {
      await tx.update(affiliateProfileStats).set({ pendingCommissionCents: sql`greatest(0, ${affiliateProfileStats.pendingCommissionCents} - ${commissionReductionCents})`, updatedAt: now }).where(eq(affiliateProfileStats.affiliateProfileId, existing.profileId));
    }
    return existing.id;
  }

  if (input.kind === "refund") {
    if (!input.orderId || !VOID_REFUND_STATUSES.has(normalizedStatus)) return null;
    await recordVoidedSource(`refund:${input.sourceId}`, "refund");
    return await reduceCommission(`order:${input.orderId}`);
  }

  if (input.kind === "order" && VOID_ORDER_STATUSES.has(normalizedStatus)) {
    return await voidCommission(sourceKey, normalizedStatus);
  }

  if (input.kind !== "order" || !PAID_ORDER_STATUSES.has(normalizedStatus) || !attribution) return null;
  if (input.occurredAt < attribution.attributedAt || input.occurredAt > addMonths(attribution.attributedAt, COMMISSION_MONTHS)) return null;
  const commissionCents = centsForCommission(input.amountCents);
  if (commissionCents <= 0) return null;

  const existing = (await tx.select({ id: affiliateCommissions.id, profileId: affiliateCommissions.affiliateProfileId, status: affiliateCommissions.status, amountCents: affiliateCommissions.amountCents, commissionCents: affiliateCommissions.commissionCents, payoutItemId: affiliateCommissions.payoutItemId }).from(affiliateCommissions).where(eq(affiliateCommissions.sourceKey, sourceKey)).limit(1))[0];
  if (existing) {
    if (existing.status === "paid" || existing.status === "voided") return existing.id;
    const deltaCents = commissionCents - existing.commissionCents;
    if (existing.payoutItemId && deltaCents !== 0) await adjustPayoutItem(existing.payoutItemId, deltaCents);
    await tx.update(affiliateCommissions).set({ billingTransactionId: input.billingTransactionId, amountCents: input.amountCents, commissionCents, currency: input.currency.toLowerCase(), status: "pending", payoutState: existing.payoutItemId ? "assigned" : "unassigned", occurredAt: input.occurredAt, clearsAt: addDays(input.occurredAt, HOLD_DAYS), updatedAt: now }).where(eq(affiliateCommissions.id, existing.id));
    if (existing.status === "pending" && deltaCents !== 0) {
      await tx.update(affiliateProfileStats).set({ pendingCommissionCents: sql`${affiliateProfileStats.pendingCommissionCents} + ${deltaCents}`, updatedAt: now }).where(eq(affiliateProfileStats.affiliateProfileId, existing.profileId));
    }
    return existing.id;
  }

  const [commission] = await tx.insert(affiliateCommissions).values({
    affiliateProfileId: attribution.profileId,
    referredBusinessId: input.businessId,
    sourceKey,
    billingTransactionId: input.billingTransactionId,
    amountCents: input.amountCents,
    commissionCents,
    currency: input.currency.toLowerCase(),
    status: "pending",
    payoutState: "unassigned",
    occurredAt: input.occurredAt,
    clearsAt: addDays(input.occurredAt, HOLD_DAYS),
  }).onConflictDoNothing({ target: affiliateCommissions.sourceKey }).returning({ id: affiliateCommissions.id });
  if (!commission) return (await tx.select({ id: affiliateCommissions.id }).from(affiliateCommissions).where(eq(affiliateCommissions.sourceKey, sourceKey)).limit(1))[0]?.id ?? null;
  await tx.insert(affiliateProfileStats).values({ affiliateProfileId: attribution.profileId, conversionCount: 1, pendingCommissionCents: commissionCents }).onConflictDoUpdate({ target: affiliateProfileStats.affiliateProfileId, set: { conversionCount: sql`${affiliateProfileStats.conversionCount} + 1`, pendingCommissionCents: sql`${affiliateProfileStats.pendingCommissionCents} + ${commissionCents}`, updatedAt: new Date() } });
  return commission.id;
}

export async function recordAffiliateCommission(
  context: DomainContext,
  input: AffiliateTransactionInput,
): Promise<string | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await recordAffiliateCommissionInTransaction(tx, input));
}

export async function generateAffiliatePayoutRun(
  context: DomainContext,
  input: { periodKey?: string; createdAt?: string } = {},
): Promise<{ payoutRunId: string; periodKey: string; status: string; assignedCommissions: number; totalCents: number }> {
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
  const periodKey = input.periodKey ?? previousMonthKey(createdAt);
  return await withDispatcherTransaction(context.db, async (tx) => {
    const existing = (await tx.select().from(affiliatePayoutRuns).where(eq(affiliatePayoutRuns.periodKey, periodKey)).limit(1))[0];
    if (existing?.status === "paid") return { payoutRunId: existing.id, periodKey, status: existing.status, assignedCommissions: 0, totalCents: existing.totalCents };
    const run = existing ?? (await tx.insert(affiliatePayoutRuns).values({ periodKey, status: "draft", totalCents: 0, currency: DEFAULT_CURRENCY, createdAt, updatedAt: createdAt }).returning())[0];
    if (!run) throw new Error("Affiliate payout run could not be created.");

    const eligible = await tx.select({
      commissionId: affiliateCommissions.id,
      profileId: affiliateCommissions.affiliateProfileId,
      commissionCents: affiliateCommissions.commissionCents,
      payoutEmail: affiliateProfiles.payoutEmail,
      affiliateEmail: users.email,
      affiliateName: users.name,
    }).from(affiliateCommissions)
      .innerJoin(affiliateProfiles, eq(affiliateProfiles.id, affiliateCommissions.affiliateProfileId))
      .innerJoin(users, eq(users.id, affiliateProfiles.userId))
      .where(and(eq(affiliateCommissions.status, "pending"), eq(affiliateCommissions.payoutState, "unassigned"), eq(affiliateCommissions.currency, DEFAULT_CURRENCY), lte(affiliateCommissions.clearsAt, createdAt), eq(affiliateProfiles.status, "active")))
      .limit(PAYOUT_BATCH_LIMIT);

    const groups = new Map<string, typeof eligible>();
    for (const commission of eligible) {
      if (!commission.payoutEmail) continue;
      const group = groups.get(commission.profileId) ?? [];
      group.push(commission);
      groups.set(commission.profileId, group);
    }

    let assignedCommissions = 0;
    for (const [profileId, group] of groups) {
      const amountCents = group.reduce((total, commission) => total + commission.commissionCents, 0);
      if (amountCents < MIN_PAYOUT_CENTS) continue;
      const current = (await tx.select().from(affiliatePayoutItems).where(and(eq(affiliatePayoutItems.payoutRunId, run.id), eq(affiliatePayoutItems.affiliateProfileId, profileId))).limit(1))[0];
      const nextAmount = (current?.amountCents ?? 0) + amountCents;
      const nextStatus = nextAmount >= MIN_PAYOUT_CENTS ? "ready" : "draft";
      const item = current
        ? (await tx.update(affiliatePayoutItems).set({ amountCents: nextAmount, status: nextStatus, updatedAt: createdAt }).where(eq(affiliatePayoutItems.id, current.id)).returning({ id: affiliatePayoutItems.id }))[0]
        : (await tx.insert(affiliatePayoutItems).values({ payoutRunId: run.id, affiliateProfileId: profileId, amountCents: nextAmount, currency: DEFAULT_CURRENCY, status: nextStatus, payoutEmail: group[0]!.payoutEmail!, affiliateEmail: group[0]!.affiliateEmail, affiliateName: group[0]!.affiliateName, createdAt, updatedAt: createdAt }).returning({ id: affiliatePayoutItems.id }))[0];
      if (!item) throw new Error("Affiliate payout item could not be created.");
      await tx.update(affiliateCommissions).set({ payoutItemId: item.id, payoutState: "assigned", updatedAt: createdAt }).where(inArray(affiliateCommissions.id, group.map((commission) => commission.commissionId)));
      assignedCommissions += group.length;
    }

    const items = await tx.select({ amountCents: affiliatePayoutItems.amountCents, status: affiliatePayoutItems.status }).from(affiliatePayoutItems).where(eq(affiliatePayoutItems.payoutRunId, run.id));
    const totalCents = items.reduce((total, item) => total + (item.status === "ready" ? item.amountCents : 0), 0);
    await tx.update(affiliatePayoutRuns).set({ totalCents, updatedAt: createdAt }).where(eq(affiliatePayoutRuns.id, run.id));
    return { payoutRunId: run.id, periodKey, status: run.status, assignedCommissions, totalCents };
  });
}

export async function markAffiliatePayoutItemPaid(
  context: DomainContext,
  input: { payoutItemId: string; externalReference?: string; note?: string; paidAt?: string },
): Promise<boolean> {
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  return await withDispatcherTransaction(context.db, async (tx) => {
    const item = (await tx.update(affiliatePayoutItems).set({ status: "paid", paidAt, ...(input.externalReference ? { externalReference: input.externalReference } : {}), ...(input.note ? { note: input.note } : {}), updatedAt: paidAt }).where(and(eq(affiliatePayoutItems.id, input.payoutItemId), eq(affiliatePayoutItems.status, "ready"))).returning({ id: affiliatePayoutItems.id, payoutRunId: affiliatePayoutItems.payoutRunId }))[0];
    if (!item) return false;
    const commissions = await tx.select({ id: affiliateCommissions.id, profileId: affiliateCommissions.affiliateProfileId, commissionCents: affiliateCommissions.commissionCents }).from(affiliateCommissions).where(and(eq(affiliateCommissions.payoutItemId, item.id), eq(affiliateCommissions.payoutState, "assigned")));
    for (const commission of commissions) {
      await tx.update(affiliateCommissions).set({ status: "paid", payoutState: "paid", paidAt, updatedAt: paidAt }).where(eq(affiliateCommissions.id, commission.id));
      await tx.update(affiliateProfileStats).set({ pendingCommissionCents: sql`greatest(0, ${affiliateProfileStats.pendingCommissionCents} - ${commission.commissionCents})`, paidCommissionCents: sql`${affiliateProfileStats.paidCommissionCents} + ${commission.commissionCents}`, updatedAt: paidAt }).where(eq(affiliateProfileStats.affiliateProfileId, commission.profileId));
    }
    const remaining = await tx.select({ id: affiliatePayoutItems.id }).from(affiliatePayoutItems).where(and(eq(affiliatePayoutItems.payoutRunId, item.payoutRunId), inArray(affiliatePayoutItems.status, ["draft", "ready"])));
    if (remaining.length === 0) await tx.update(affiliatePayoutRuns).set({ status: "paid", updatedAt: paidAt }).where(eq(affiliatePayoutRuns.id, item.payoutRunId));
    return true;
  });
}

export async function requireAffiliateAdmin(
  context: DomainContext,
  input: { userId: string; businessId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
  });
}
