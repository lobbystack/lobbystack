import { and, desc, eq, gt, inArray, isNotNull, like, lt, or, sql } from "drizzle-orm";

import { billingAccounts, billingCheckoutRequests, billingTransactions, billingUsageEvents, businesses, enqueueOutbox, partnerBillingAccounts, providerEvents, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { billingErrorCodes, DEFAULT_WEB_CALL_MAX_DURATION_MS, hasLiveEntitlement, liveSubscriptionStates, MAX_WEB_CALL_MAX_DURATION_MS, type BillingPlanSlug } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import type { DomainContext } from "./context";
import { recordAffiliateCommissionInTransaction } from "./affiliates";
import { requireBusinessCapability } from "./businessAccess";
import { loadEntitlement } from "./entitlement";
import { keepBusinessNumbersInTransaction, queuePlanCancelNoticeInTransaction, scheduleNumberReleaseInTransaction } from "./numberTrials";
import { poolLeft, readPartnerPoolInTransaction } from "./partnerPool";
import { subscriptionEventEffect } from "./polarSubscriptions";
import { recordProductEventInTransaction } from "./productEvents";
import { requireBusinessAdmin } from "../authz";
import { correctUsageInTransaction, enqueueUsageSyncInTransaction, getUsageStatusInTransaction, getVoiceSecondsLeftInTransaction, loadBillingContext, periodKeyFor, readUsageStatusInTransaction, readVoiceSecondsLeftInTransaction, reserveUsageInTransaction } from "./usage";

export type BillingCheckoutTarget = "starter" | "pro";
export type BillingInterval = "monthly" | "annual";

export type WebVoiceBillingAllowance = {
  allowed: boolean;
  errorCode: typeof billingErrorCodes.voiceLimitReached | null;
  maxDurationMs: number;
  plan: BillingPlanSlug;
};

export function normalizeWebCallMaxDurationMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return DEFAULT_WEB_CALL_MAX_DURATION_MS;
  return Math.min(Math.floor(value), MAX_WEB_CALL_MAX_DURATION_MS);
}

function webVoiceBillingAllowance({ plan, seconds }: { plan: BillingPlanSlug; seconds: number }, requestedMs: number | undefined): WebVoiceBillingAllowance {
  const maxDurationMs = Math.floor(Math.min(normalizeWebCallMaxDurationMs(requestedMs), seconds * 1_000));
  return {
    allowed: maxDurationMs >= 1,
    errorCode: maxDurationMs >= 1 ? null : billingErrorCodes.voiceLimitReached,
    maxDurationMs,
    plan,
  };
}

export async function getWebVoiceBillingAllowance(
  context: DomainContext,
  input: { businessId: string; maxDurationMs?: number },
): Promise<WebVoiceBillingAllowance> {
  // Decides whether to offer a call without the usage lock; the call's reservation counts again.
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => webVoiceBillingAllowance(await readVoiceSecondsLeftInTransaction(tx, { businessId: input.businessId }), input.maxDurationMs));
}

export async function reserveWebVoiceUsageInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; callId: string; maxDurationMs?: number },
): Promise<WebVoiceBillingAllowance> {
  const left = await getVoiceSecondsLeftInTransaction(tx, { businessId: input.businessId });
  const allowance = webVoiceBillingAllowance(left, input.maxDurationMs);
  if (!allowance.allowed) return allowance;
  // A self-hosted server has no limit to reserve against.
  if (left.entitlement.source === "unlimited") return allowance;
  const reservation = await reserveUsageInTransaction(tx, { businessId: input.businessId, usageKind: "voice_seconds", sourceKey: `voice:${input.callId}`, quantity: allowance.maxDurationMs / 1_000 });
  if (!reservation.allowed) {
    return { allowed: false, errorCode: billingErrorCodes.voiceLimitReached, maxDurationMs: 0, plan: allowance.plan };
  }
  return allowance;
}

export async function finalizeWebVoiceUsageInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; callId: string; durationSeconds: number },
): Promise<void> {
  const existing = (await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, `voice:${input.callId}`))).limit(1))[0];
  if (!existing) return;
  const usageEventId = await correctUsageInTransaction(tx, { businessId: input.businessId, sourceKey: `voice:${input.callId}`, usageKind: "voice_seconds", quantity: input.durationSeconds });
  await enqueueUsageSyncInTransaction(tx, { businessId: input.businessId, usageEventId });
}

export type WidgetChatBillingAllowance = {
  allowed: boolean;
  errorCode: typeof billingErrorCodes.chatAiLimitReached | null;
  plan: BillingPlanSlug;
};

export async function getWidgetChatAllowance(
  context: DomainContext,
  input: { businessId: string },
): Promise<WidgetChatBillingAllowance> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // Decides whether to offer the chat without writing; each chat's reservation counts again.
    const status = await readUsageStatusInTransaction(tx, { businessId: input.businessId });
    const { allowance, overage, poolPartnerId } = await loadEntitlement(tx, input.businessId);
    const refused = { allowed: false, errorCode: billingErrorCodes.chatAiLimitReached, plan: status.plan };
    // Past its allowance, a chat needs overage, and room under the cap when a package prices it.
    if (allowance.chats !== null && (status.chatAiBlocked || (!overage.enabled && Math.max(0, allowance.chats - status.chatAiTokensUsed) < 1))) return refused;
    // A partner's business also needs a chat left in its partner's pool: its tier's, or the one its host set.
    if (poolPartnerId && poolLeft(await readPartnerPoolInTransaction(tx, { partnerId: poolPartnerId, periodKey: periodKeyFor() }), "chat_ai_tokens") < 1) return refused;
    return { allowed: true, errorCode: null, plan: status.plan };
  });
}

export async function reserveWidgetChatUsageInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; conversationId: string },
): Promise<WidgetChatBillingAllowance> {
  const { plan, entitlement } = await loadBillingContext(tx, input.businessId);
  // A partner's business counts its chats with no allowance too: they draw on its partner's pool, and the console shows them.
  if (entitlement.allowance.chats !== null || entitlement.poolPartnerId !== null) {
    const reservation = await reserveUsageInTransaction(tx, { businessId: input.businessId, usageKind: "chat_ai_tokens", sourceKey: `chat:${input.conversationId}`, quantity: 1 });
    if (!reservation.allowed) return { allowed: false, errorCode: billingErrorCodes.chatAiLimitReached, plan };
    // A chat past the partner's pool is overage the partner pays for, which syncs to Polar.
    if (entitlement.poolPartnerId !== null && reservation.syncNeeded && reservation.usageEventId) await enqueueUsageSyncInTransaction(tx, { businessId: input.businessId, usageEventId: reservation.usageEventId });
  }
  return { allowed: true, errorCode: null, plan };
}

// We never learn that someone abandoned a Polar checkout, so one counts as open for 30 minutes: time to finish paying, and short enough that a dropped one stops blocking soon.
const openCheckoutWindowMs = 30 * 60_000;

/**
 * Refuses a checkout that could start a second subscription: the business
 * already pays (plan changes go through the customer portal) or someone else's
 * checkout is open. Asking again for the same open checkout returns it, and
 * asking for another plan replaces your own.
 */
export async function createBillingCheckoutRequest(
  context: DomainContext,
  input: { userId: string; businessId: string; target: BillingCheckoutTarget; billingInterval: BillingInterval },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return await createBillingCheckoutRequestInTransaction(tx, input);
  });
}

/**
 * Queues a Polar checkout for a plan in the name of the person asking, whose
 * email Polar fills in. A business that already pays, or is on a managed plan
 * (the operator bills it, so a Polar subscription would bill it twice), is
 * refused. Callers authorize first.
 */
export async function createBillingCheckoutRequestInTransaction(
  tx: DatabaseTransaction,
  input: { userId: string; businessId: string; target: BillingCheckoutTarget; billingInterval: BillingInterval },
): Promise<string> {
  // Two tabs asking at once would both see no open checkout without this.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing-checkout:${input.businessId}`}, 0))`);
  // The lock a managed plan takes, so a checkout and a managed plan can't both start at once.
  await lockBillingAccount(tx, input.businessId);
  // A partner's business pays its partner, never the host through Polar.
  await requireBusinessCapability(tx, { businessId: input.businessId, capability: "billing" });
  const account = (await tx.select({ source: billingAccounts.source, plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1))[0];
  if (isManagedBillingAccount(account)) throw Object.assign(new Error("This business is on a managed plan, so LobbyStack bills it directly."), { status: 409 });
  if ((await loadEntitlement(tx, input.businessId)).live) {
    throw Object.assign(new Error("This workspace already has a paid plan. Change it from Manage subscription."), { status: 409, code: billingErrorCodes.subscriptionActive });
  }
  const open = (await tx.select({ id: billingCheckoutRequests.id, requestedByUserId: billingCheckoutRequests.requestedByUserId, target: billingCheckoutRequests.target, billingInterval: billingCheckoutRequests.billingInterval })
    .from(billingCheckoutRequests)
    .where(and(eq(billingCheckoutRequests.businessId, input.businessId), inArray(billingCheckoutRequests.status, ["pending", "processing", "ready"]), gt(billingCheckoutRequests.createdAt, new Date(Date.now() - openCheckoutWindowMs))))
    .orderBy(desc(billingCheckoutRequests.createdAt))
    .limit(1))[0];
  if (open) {
    if (open.requestedByUserId !== input.userId) throw Object.assign(new Error("A checkout is already open for this workspace."), { status: 409, code: billingErrorCodes.checkoutInProgress });
    if (open.target === input.target && open.billingInterval === input.billingInterval) return open.id;
    // The same person picking another plan, such as after Polar's back arrow, replaces their own checkout.
    // The old Polar session stays open, but Polar allows one active subscription per customer
    // (keep "Allow multiple subscriptions" off), so paying in both tabs can't start two.
    await tx.update(billingCheckoutRequests).set({ status: "superseded", updatedAt: new Date() }).where(and(eq(billingCheckoutRequests.id, open.id), eq(billingCheckoutRequests.businessId, input.businessId)));
  }
  await tx.insert(billingAccounts).values({ businessId: input.businessId, billingKey: `business:${input.businessId}` }).onConflictDoNothing({ target: billingAccounts.businessId });
  const [request] = await tx.insert(billingCheckoutRequests).values({
    businessId: input.businessId,
    requestedByUserId: input.userId,
    target: input.target,
    billingInterval: input.billingInterval,
    status: "pending",
  }).returning({ id: billingCheckoutRequests.id });
  if (!request) throw new Error("Billing checkout request could not be created.");
  await enqueueOutbox(tx, {
    topic: "billing.createCheckout",
    businessId: input.businessId,
    aggregateType: "billing_checkout_request",
    aggregateId: request.id,
    dedupeKey: `billing-checkout:${request.id}`,
    payload: { requestId: request.id },
  });
  return request.id;
}

/**
 * A billing account whose plan the LobbyStack operator runs outside Polar and
 * bills directly. Polar events don't change it unless the business starts a
 * live Polar subscription, which then takes over.
 */
export const MANAGED_BILLING_SOURCE = "managed";

function isLiveSubscriptionState(state: string | null | undefined): boolean {
  return (liveSubscriptionStates as readonly string[]).includes(state ?? "");
}

/** Whether a billing account is on a managed plan now. An ended managed plan keeps its source, for the finance export, but isn't live. */
export function isManagedBillingAccount(account: { source?: string | null; subscriptionState: string | null } | null | undefined): boolean {
  return account?.source === MANAGED_BILLING_SOURCE && isLiveSubscriptionState(account.subscriptionState);
}

/** Billing account changes take this lock, the same one Polar reconciliation takes, so the two can't interleave. */
async function lockBillingAccount(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing-reconcile:${businessId}`}, 0))`);
}

/**
 * Puts a business on the enterprise plan outside Polar, which unlocks what a
 * paid plan unlocks while the operator bills the business directly. A business
 * with a live Polar subscription, for any product, is refused, so no one pays
 * twice. A spending cap left from an earlier Starter or Pro plan is cleared,
 * because on enterprise a cap leaves calls nothing to reserve. A partner's
 * business is refused too: its partner bills it, and the host bills the
 * partner for its tier. Callers check that an operator asked.
 */
export async function setManagedPlanInTransaction(tx: DatabaseTransaction, input: { businessId: string }): Promise<"set" | "unchanged" | "paid_through_polar" | "partner_business"> {
  const [business] = await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (business?.partnerId) return "partner_business";
  await lockBillingAccount(tx, input.businessId);
  const [account] = await tx.select({ source: billingAccounts.source, plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState, overageSpendingCapCents: billingAccounts.overageSpendingCapCents }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1);
  if (isManagedBillingAccount(account) && account?.plan === "enterprise" && account.overageSpendingCapCents === null) return "unchanged";
  if (account && account.source !== MANAGED_BILLING_SOURCE && isLiveSubscriptionState(account.subscriptionState)) return "paid_through_polar";
  const now = new Date();
  const managed = { source: MANAGED_BILLING_SOURCE, plan: "enterprise", subscriptionState: "active", billingInterval: null, subscriptionId: null, currentPeriodStart: now, currentPeriodEnd: null, overageSpendingCapCents: null };
  await tx.insert(billingAccounts).values({ businessId: input.businessId, billingKey: `business:${input.businessId}`, ...managed }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { ...managed, updatedAt: now } });
  // Checkouts Polar hasn't made a page for yet would sell a plan the operator now bills, so they stop here.
  await tx.update(billingCheckoutRequests).set({ status: "canceled", error: "The business moved to a managed plan.", updatedAt: now }).where(and(eq(billingCheckoutRequests.businessId, input.businessId), inArray(billingCheckoutRequests.status, ["pending", "processing", "error"])));
  // A managed plan is a paid plan: a trial number becomes the business's number, and a scheduled release is called off.
  await keepBusinessNumbersInTransaction(tx, { businessId: input.businessId, now });
  await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "billing_account", aggregateId: input.businessId, dedupeKey: `billing:${input.businessId}:managed:${now.getTime()}`, payload: { type: "billing.updated", entityId: input.businessId } });
  return "set";
}

/**
 * Ends a business's managed plan, which puts it on the free plan. The account
 * keeps its managed source and enterprise plan, now canceled, so the finance
 * export still shows the managed period and when it ended. False when the
 * business has no managed plan. Callers check that an operator asked.
 */
export async function endManagedPlanInTransaction(tx: DatabaseTransaction, input: { businessId: string }): Promise<boolean> {
  await lockBillingAccount(tx, input.businessId);
  const now = new Date();
  const ended = await tx.update(billingAccounts)
    .set({ subscriptionState: "canceled", currentPeriodEnd: now, updatedAt: now })
    .where(and(eq(billingAccounts.businessId, input.businessId), eq(billingAccounts.source, MANAGED_BILLING_SOURCE), inArray(billingAccounts.subscriptionState, [...liveSubscriptionStates])))
    .returning({ id: billingAccounts.id });
  if (!ended.length) return false;
  // As when a paid plan ends: the numbers stay 30 more days, then go.
  await scheduleNumberReleaseInTransaction(tx, { businessId: input.businessId, now });
  await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "billing_account", aggregateId: input.businessId, dedupeKey: `billing:${input.businessId}:managed-ended:${now.getTime()}`, payload: { type: "billing.updated", entityId: input.businessId } });
  return true;
}

export async function loadBillingCheckoutRequest(
  context: DomainContext,
  input: { businessId: string; requestId: string },
): Promise<{
  id: string;
  businessId: string;
  target: BillingCheckoutTarget;
  billingInterval: BillingInterval;
  status: string;
  checkoutId: string | null;
  checkoutUrl: string | null;
  error: string | null;
  customerEmail: string;
  externalCustomerId: string;
  onboardingStage: string;
} | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({
      id: billingCheckoutRequests.id,
      businessId: billingCheckoutRequests.businessId,
      target: billingCheckoutRequests.target,
      billingInterval: billingCheckoutRequests.billingInterval,
      status: billingCheckoutRequests.status,
      checkoutId: billingCheckoutRequests.checkoutId,
      checkoutUrl: billingCheckoutRequests.checkoutUrl,
      error: billingCheckoutRequests.error,
      customerEmail: users.email,
      billingKey: billingAccounts.billingKey,
      onboardingStage: businesses.onboardingStage,
    }).from(billingCheckoutRequests)
      .innerJoin(users, eq(users.id, billingCheckoutRequests.requestedByUserId))
      .leftJoin(billingAccounts, eq(billingAccounts.businessId, billingCheckoutRequests.businessId))
      .innerJoin(businesses, eq(businesses.id, billingCheckoutRequests.businessId))
      .where(and(eq(billingCheckoutRequests.id, input.requestId), eq(billingCheckoutRequests.businessId, input.businessId)))
      .limit(1))[0];
    if (!row || !isBillingCheckoutTarget(row.target) || !isBillingInterval(row.billingInterval)) return null;
    return {
      ...row,
      target: row.target,
      billingInterval: row.billingInterval,
      externalCustomerId: row.billingKey ?? `business:${input.businessId}`,
    };
  });
}

const billingCheckoutLeaseMs = 10 * 60_000;

export async function claimBillingCheckoutRequest(
  context: DomainContext,
  input: { businessId: string; requestId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const staleBefore = new Date(Date.now() - billingCheckoutLeaseMs);
    const rows = await tx.update(billingCheckoutRequests).set({ status: "processing", updatedAt: new Date(), error: null }).where(and(
      eq(billingCheckoutRequests.id, input.requestId),
      eq(billingCheckoutRequests.businessId, input.businessId),
      or(eq(billingCheckoutRequests.status, "pending"), eq(billingCheckoutRequests.status, "error"), and(eq(billingCheckoutRequests.status, "processing"), lt(billingCheckoutRequests.updatedAt, staleBefore))),
    )).returning({ id: billingCheckoutRequests.id });
    return rows.length > 0;
  });
}

/** When another run holds this checkout request, the time its lease ends and it may be claimed again. */
export async function billingCheckoutLeaseEndsAt(context: DomainContext, input: { businessId: string; requestId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ updatedAt: billingCheckoutRequests.updatedAt }).from(billingCheckoutRequests).where(and(eq(billingCheckoutRequests.id, input.requestId), eq(billingCheckoutRequests.businessId, input.businessId), eq(billingCheckoutRequests.status, "processing"))).limit(1))[0];
    return row ? new Date(row.updatedAt.getTime() + billingCheckoutLeaseMs) : null;
  });
}

export async function markBillingCheckoutCreated(
  context: DomainContext,
  input: { businessId: string; requestId: string; checkoutId: string; checkoutUrl: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(billingCheckoutRequests).set({ status: "ready", checkoutId: input.checkoutId, checkoutUrl: input.checkoutUrl, error: null, updatedAt: new Date() }).where(and(eq(billingCheckoutRequests.id, input.requestId), eq(billingCheckoutRequests.businessId, input.businessId), eq(billingCheckoutRequests.status, "processing"))).returning({ id: billingCheckoutRequests.id });
    if (rows.length > 0) {
      await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "billing_checkout_request", aggregateId: input.requestId, dedupeKey: `billing-checkout:${input.requestId}:ready`, payload: { type: "billing.updated", entityId: input.requestId } });
    }
    return rows.length > 0;
  });
}

export async function markBillingCheckoutFailed(
  context: DomainContext,
  input: { businessId: string; requestId: string; error: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(billingCheckoutRequests).set({ status: "error", error: input.error, updatedAt: new Date() }).where(and(eq(billingCheckoutRequests.id, input.requestId), eq(billingCheckoutRequests.businessId, input.businessId), eq(billingCheckoutRequests.status, "processing"))).returning({ id: billingCheckoutRequests.id });
    if (rows.length > 0) {
      await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "billing_checkout_request", aggregateId: input.requestId, dedupeKey: `billing-checkout:${input.requestId}:error`, payload: { type: "billing.updated", entityId: input.requestId } });
    }
    return rows.length > 0;
  });
}

function isBillingCheckoutTarget(value: string): value is BillingCheckoutTarget {
  return value === "starter" || value === "pro";
}

function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export async function getBillingUsageStatus(
  context: DomainContext,
  input: { businessId: string; periodKey?: string },
) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await getUsageStatusInTransaction(tx, input));
}

export async function setOverageSpendingCap(
  context: DomainContext,
  input: { userId: string; businessId: string; capCents: number | null },
): Promise<{ overageSpendingCapCents: number | null; overageSpendCents: number; overageSpendingCapReached: boolean }> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    // A partner's business has no billing with the host, whatever route asked.
    await requireBusinessCapability(tx, { businessId: input.businessId, capability: "billing" });
    return await setOverageSpendingCapInTransaction(tx, input);
  });
}

/** Sets or clears the cap on a Starter or Pro plan's overage spend this month. Callers authorize first. */
export async function setOverageSpendingCapInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; capCents: number | null },
): Promise<{ overageSpendingCapCents: number | null; overageSpendCents: number; overageSpendingCapReached: boolean }> {
  if (input.capCents !== null && (!Number.isSafeInteger(input.capCents) || input.capCents < 0)) {
    throw new Error("Overage spending cap must be a non-negative whole number of cents.");
  }
  const current = await getUsageStatusInTransaction(tx, { businessId: input.businessId });
  if (current.plan !== "starter" && current.plan !== "pro") {
    throw new Error("Overage spending caps are available on Starter and Pro plans.");
  }
  const rows = await tx.update(billingAccounts)
    .set({ overageSpendingCapCents: input.capCents, updatedAt: new Date() })
    .where(eq(billingAccounts.businessId, input.businessId))
    .returning({ id: billingAccounts.id });
  if (!rows[0]) throw new Error("A billing account is required to set an overage spending cap.");
  const status = await getUsageStatusInTransaction(tx, { businessId: input.businessId });
  return { overageSpendingCapCents: input.capCents, overageSpendCents: status.overageSpendCents, overageSpendingCapReached: status.overageSpendingCapReached };
}

export async function reserveAlertSmsUsage(
  context: DomainContext,
  input: { businessId: string; sourceKey: string; estimatedSegments: number; recordedAt?: Date },
): Promise<Awaited<ReturnType<typeof reserveUsageInTransaction>>> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await reserveUsageInTransaction(tx, { businessId: input.businessId, usageKind: "alert_sms_segments", sourceKey: input.sourceKey, quantity: Math.max(1, Math.trunc(input.estimatedSegments)), recordedAt: input.recordedAt }));
}

export async function correctAlertSmsUsage(
  context: DomainContext,
  input: { businessId: string; sourceKey: string; segments: number; recordedAt?: Date },
): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await correctUsageInTransaction(tx, { businessId: input.businessId, sourceKey: input.sourceKey, usageKind: "alert_sms_segments", quantity: Math.max(0, Math.trunc(input.segments)), recordedAt: input.recordedAt }));
}

export async function reserveOutboundCallAttempt(
  context: DomainContext,
  input: { businessId: string; sourceKey: string; recordedAt?: Date },
): Promise<Awaited<ReturnType<typeof reserveUsageInTransaction>>> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const reservation = await reserveUsageInTransaction(tx, { businessId: input.businessId, usageKind: "outbound_call_attempts", sourceKey: input.sourceKey, quantity: 1, recordedAt: input.recordedAt });
    if (reservation.allowed && reservation.usageEventId) await enqueueUsageSyncInTransaction(tx, { businessId: input.businessId, usageEventId: reservation.usageEventId });
    return reservation;
  });
}

export async function enqueueBillingUsageSync(context: DomainContext, input: { businessId: string; usageEventId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await enqueueUsageSyncInTransaction(tx, input));
}

export async function loadBillingUsageEvent(
  context: DomainContext,
  input: { businessId: string; usageEventId: string },
): Promise<{
  id: string;
  sourceKey: string;
  isFinal: boolean;
  plan: string | null;
  businessId: string;
  usageKind: string;
  quantity: number;
  billableQuantity: number | null;
  billingIntervalAtRecordTime: string | null;
  createdAt: Date;
  syncStatus: string;
  billingKey: string;
  customerId: string | null;
} | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({
      id: billingUsageEvents.id,
      sourceKey: billingUsageEvents.sourceKey,
      isFinal: billingUsageEvents.isFinal,
      plan: sql<string | null>`coalesce(${billingUsageEvents.planAtRecordTime}, ${billingAccounts.plan})`,
      businessId: billingUsageEvents.businessId,
      usageKind: billingUsageEvents.usageKind,
      quantity: billingUsageEvents.quantity,
      billableQuantity: billingUsageEvents.billableQuantity,
      billingIntervalAtRecordTime: billingUsageEvents.billingIntervalAtRecordTime,
      createdAt: billingUsageEvents.createdAt,
      syncStatus: billingUsageEvents.syncStatus,
      billingKey: billingAccounts.billingKey,
      customerId: billingAccounts.customerId,
    })
      .from(billingUsageEvents)
      .innerJoin(billingAccounts, eq(billingAccounts.businessId, billingUsageEvents.businessId))
      .where(and(
        eq(billingUsageEvents.id, input.usageEventId),
        eq(billingUsageEvents.businessId, input.businessId),
      ))
      .limit(1))[0];
    return row ?? null;
  });
}

/**
 * A usage event that drew on a partner's pool, as the worker reports its
 * overage to Polar: what the event put past the pool and what that costs at
 * the tier's rates, under the partner's customer. The business pays the host
 * nothing, so the event syncs nothing else. Null for usage on no pool.
 */
export async function loadPoolUsageEvent(
  context: DomainContext,
  input: { businessId: string; usageEventId: string },
): Promise<{
  id: string;
  businessId: string;
  usageKind: string;
  isFinal: boolean;
  syncStatus: string;
  createdAt: Date;
  partnerId: string;
  overageQuantity: number;
  overageCents: number;
  /** The partner's Polar customer, or null when Polar never billed it. */
  customerId: string | null;
} | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({
      id: billingUsageEvents.id,
      businessId: billingUsageEvents.businessId,
      usageKind: billingUsageEvents.usageKind,
      isFinal: billingUsageEvents.isFinal,
      syncStatus: billingUsageEvents.syncStatus,
      createdAt: billingUsageEvents.createdAt,
      partnerId: billingUsageEvents.poolPartnerId,
      overageQuantity: billingUsageEvents.poolOverageQuantity,
      overageCents: billingUsageEvents.poolOverageCents,
      customerId: partnerBillingAccounts.customerId,
    })
      .from(billingUsageEvents)
      .leftJoin(partnerBillingAccounts, eq(partnerBillingAccounts.partnerId, billingUsageEvents.poolPartnerId))
      .where(and(eq(billingUsageEvents.id, input.usageEventId), eq(billingUsageEvents.businessId, input.businessId), isNotNull(billingUsageEvents.poolPartnerId)))
      .limit(1);
    if (!row?.partnerId) return null;
    return { ...row, partnerId: row.partnerId, overageQuantity: row.overageQuantity ?? 0, overageCents: row.overageCents ?? 0 };
  });
}

export async function markBillingUsageSynced(
  context: DomainContext,
  input: { businessId: string; usageEventId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(billingUsageEvents)
      .set({ syncStatus: "synced", updatedAt: new Date() })
      .where(and(
        eq(billingUsageEvents.id, input.usageEventId),
        eq(billingUsageEvents.businessId, input.businessId),
        eq(billingUsageEvents.syncStatus, "pending"),
      ))
      .returning({ id: billingUsageEvents.id });
    return rows.length > 0;
  });
}

function recordObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function stringField(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function numberField(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/**
 * What Polar refunded on an order. The order total includes tax, and Polar
 * reports refunded tax apart from the refunded amount.
 */
export function orderRefundedCents(order: Record<string, unknown>, payload: Record<string, unknown>): number {
  return (numberField(order, "refundedAmount", "refunded_amount") ?? numberField(payload, "refundedAmount", "refunded_amount") ?? 0)
    + (numberField(order, "refundedTaxAmount", "refunded_tax_amount") ?? numberField(payload, "refundedTaxAmount", "refunded_tax_amount") ?? 0);
}

function dateField(source: Record<string, unknown>, ...keys: string[]): Date | undefined {
  const value = stringField(source, ...keys);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

/**
 * When a canceled plan ends, or null when it renews. Polar keeps the
 * subscription active until then, so only its newest snapshot says so.
 */
export async function scheduledSubscriptionEndInTransaction(tx: DatabaseTransaction, businessId: string): Promise<string | null> {
  // The customer may hold other subscriptions, so only the plan's own subscription says when the plan ends.
  const subscriptionId = (await tx.select({ subscriptionId: billingAccounts.subscriptionId }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0]?.subscriptionId;
  if (!subscriptionId) return null;
  const latest = (await tx.select({ payload: providerEvents.payload }).from(providerEvents)
    .where(and(eq(providerEvents.businessId, businessId), eq(providerEvents.provider, "polar"), like(providerEvents.eventType, "subscription.%"), eq(providerEvents.status, "processed"), sql`${providerEvents.payload}->>'subscriptionId' = ${subscriptionId}`))
    .orderBy(sql`${providerEvents.payload}->>'subscriptionModifiedAt' desc nulls last`, desc(providerEvents.createdAt))
    .limit(1))[0]?.payload;
  if (latest?.cancel_at_period_end !== true || !["active", "trialing"].includes(String(latest.status))) return null;
  return stringField(latest, "ends_at", "current_period_end") ?? null;
}

export type SubscriptionStart = { plan: string; billingInterval: string | null; previousPlan: string | null };

/**
 * A subscription starts on the edge into a paid, live plan. Later webhooks for
 * the same subscription describe an account that was already paying, so they
 * must not report a second start.
 */
export function detectSubscriptionStart(
  previous: { plan: string | null; subscriptionState: string | null } | undefined,
  next: { plan: string | null; subscriptionState: string | null; billingInterval: string | null },
): SubscriptionStart | null {
  if (!hasLiveEntitlement(next)) return null;
  if (hasLiveEntitlement(previous)) return null;
  return { plan: next.plan!, billingInterval: next.billingInterval, previousPlan: previous?.plan ?? null };
}

export async function reconcileBillingProviderEvent(
  context: DomainContext,
  input: { businessId: string; providerEventId: string },
): Promise<boolean> {
  const outcome = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx): Promise<{ reconciled: boolean; started: SubscriptionStart | null }> => {
    let startedSubscription: SubscriptionStart | null = null;
    // The provider can deliver several live events for one checkout at once
    // (subscription.active beside order.paid). Without this lock both workers
    // read the same pre-paid account and each reports a subscription start, so
    // the event would count webhook races instead of subscriptions.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing-reconcile:${input.businessId}`}, 0))`);
    const event = (await tx.select({ id: providerEvents.id, providerEventId: providerEvents.providerEventId, eventType: providerEvents.eventType, status: providerEvents.status, payload: providerEvents.payload, createdAt: providerEvents.createdAt })
      .from(providerEvents)
      .where(and(eq(providerEvents.id, input.providerEventId), eq(providerEvents.businessId, input.businessId)))
      .limit(1))[0];
    if (!event) return { reconciled: false, started: null };
    if (event.status === "processed") return { reconciled: true, started: null };

    const payload = recordObject(event.payload);
    const transactionPayload = recordObject(payload.order ?? payload);
    const customer = recordObject(payload.customer);
    const subscription = recordObject(payload.subscription);
    const existing = (await tx.select({
      billingKey: billingAccounts.billingKey,
      customerId: billingAccounts.customerId,
      subscriptionId: billingAccounts.subscriptionId,
      plan: billingAccounts.plan,
      subscriptionState: billingAccounts.subscriptionState,
      billingInterval: billingAccounts.billingInterval,
      source: billingAccounts.source,
    }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1))[0];
    const billingKey = stringField(transactionPayload, "billingKey", "externalCustomerId", "customerId") ?? stringField(payload, "billingKey", "externalCustomerId", "customerId") ?? stringField(customer, "id", "externalId") ?? existing?.billingKey;
    if (billingKey) {
      const customerId = stringField(transactionPayload, "customerId", "externalCustomerId") ?? stringField(payload, "customerId", "externalCustomerId") ?? stringField(customer, "id", "externalId") ?? existing?.customerId;
      // The subscription this event is about, if it names one. The account's own stays in existing.
      const eventSubscriptionId = stringField(transactionPayload, "subscriptionId", "subscription_id") ?? stringField(payload, "subscriptionId", "subscription_id") ?? stringField(subscription, "id");
      const subscriptionId = eventSubscriptionId ?? existing?.subscriptionId;
      // An unmapped product (a retired or legacy product id) keeps the stored plan rather than a display name.
      const plan = stringField(transactionPayload, "plan") ?? stringField(payload, "plan");
      const billingInterval = stringField(transactionPayload, "billingInterval", "billing_interval", "interval") ?? stringField(payload, "billingInterval", "billing_interval", "interval") ?? stringField(subscription, "billingInterval", "billing_interval", "interval");
      // Only a subscription's own status is a subscription state. An order's status
      // (paid, refunded) is not, and an order without a nested subscription has none.
      const subscriptionState = stringField(transactionPayload, "subscriptionState") ?? stringField(payload, "subscriptionState") ?? (event.eventType.startsWith("subscription.") ? stringField(payload, "status") ?? event.eventType.slice("subscription.".length) : undefined);
      const currentPeriodStart = dateField(transactionPayload, "currentPeriodStart", "current_period_start") ?? dateField(payload, "currentPeriodStart", "current_period_start") ?? dateField(subscription, "currentPeriodStart", "current_period_start");
      const currentPeriodEnd = dateField(transactionPayload, "currentPeriodEnd", "current_period_end") ?? dateField(payload, "currentPeriodEnd", "current_period_end") ?? dateField(subscription, "currentPeriodEnd", "current_period_end");
      // One Polar customer can hold several subscriptions, so the event changes the plan only
      // when it's about the subscription the account stores, or a live plan that replaces it.
      // A support plan, or a product from the other catalog, sells this account nothing.
      const sellsNothing = payload.selfHostedSupport === true || payload.foreignProduct === true;
      const effect = subscriptionEventEffect({
        storedSubscriptionId: existing?.subscriptionId,
        eventSubscriptionId,
        sellsNothing,
        startsLivePlan: (plan === "starter" || plan === "pro") && isLiveSubscriptionState(subscriptionState),
      });
      // A support plan this account doesn't follow is someone's purchase of support, not a payment for the business.
      if (sellsNothing && effect === "ignore") {
        await tx.update(providerEvents).set({ status: "ignored", updatedAt: new Date() }).where(eq(providerEvents.id, event.id));
        return { reconciled: false, started: null };
      }
      // The plan's own subscription now sells support, so the hosted plan ends with it.
      const ends = effect === "end";
      const appliedPlan = ends ? undefined : plan;
      const appliedInterval = ends ? undefined : billingInterval;
      const appliedState = ends ? "canceled" : subscriptionState;
      const appliedPeriodStart = ends ? undefined : currentPeriodStart;
      const appliedPeriodEnd = ends ? undefined : currentPeriodEnd;
      // A Polar retry or replay can arrive after a newer snapshot of the subscription was applied.
      // Only the same subscription's snapshots count: another of the customer's subscriptions is no newer copy of this one.
      // Both sides are normalized ISO strings (polar-event.ts), so text order is time order.
      const modifiedAt = stringField(payload, "subscriptionModifiedAt");
      const stale = modifiedAt !== undefined && (await tx.select({ id: providerEvents.id }).from(providerEvents)
        .where(and(
          eq(providerEvents.businessId, input.businessId),
          eq(providerEvents.status, "processed"),
          sql`${providerEvents.payload}->>'subscriptionModifiedAt' > ${modifiedAt}`,
          ...(eventSubscriptionId ? [sql`${providerEvents.payload}->>'subscriptionId' = ${eventSubscriptionId}`] : []),
        ))
        .limit(1)).length > 0;
      // An account whose plan the operator managed, now or before, changes only when the business
      // starts a live Starter or Pro subscription in Polar, which then takes over. Every other event,
      // such as a late cancellation of an older subscription or a product this deployment doesn't
      // map to a plan, leaves the account as the operator set it: a live managed plan stays live,
      // and an ended one keeps its enterprise plan from turning live again without a price.
      const managedSource = existing?.source === MANAGED_BILLING_SOURCE;
      const takesOver = managedSource && (appliedPlan === "starter" || appliedPlan === "pro") && isLiveSubscriptionState(appliedState);
      const keepsManagedPlan = managedSource && !takesOver;
      // Another of the customer's subscriptions leaves the plan as it is; its orders are still recorded below.
      const leavesPlan = stale || keepsManagedPlan || effect === "ignore";
      const subscriptionFields = leavesPlan ? {} : {
        ...(takesOver ? { source: "polar" } : {}),
        ...(subscriptionId ? { subscriptionId } : {}),
        ...(appliedPlan ? { plan: appliedPlan } : {}),
        ...(appliedInterval ? { billingInterval: appliedInterval } : {}),
        ...(appliedState ? { subscriptionState: appliedState } : {}),
        ...(appliedPeriodStart ? { currentPeriodStart: appliedPeriodStart } : {}),
        ...(appliedPeriodEnd ? { currentPeriodEnd: appliedPeriodEnd } : {}),
      };
      // A takeover starts a Polar subscription even though the managed plan already counted as paid.
      startedSubscription = leavesPlan ? null : detectSubscriptionStart(takesOver ? { plan: existing?.plan ?? null, subscriptionState: null } : existing, {
        plan: appliedPlan ?? existing?.plan ?? null,
        subscriptionState: appliedState ?? existing?.subscriptionState ?? null,
        billingInterval: appliedInterval ?? existing?.billingInterval ?? null,
      });
      await tx.insert(billingAccounts).values({
        businessId: input.businessId,
        billingKey,
        ...(customerId ? { customerId } : {}),
        ...subscriptionFields,
      }).onConflictDoUpdate({
        target: billingAccounts.businessId,
        set: {
          billingKey,
          ...(customerId ? { customerId } : {}),
          ...subscriptionFields,
          updatedAt: new Date(),
        },
      });
      // A managed plan the event left alone keeps its numbers as they are.
      if (!leavesPlan) {
        // A live paid plan keeps the business's numbers, including a trial number.
        // When a paid plan ends, the numbers stay 30 more days, then go.
        const wasPaid = hasLiveEntitlement(existing);
        const isPaid = hasLiveEntitlement({ plan: appliedPlan ?? existing?.plan ?? null, subscriptionState: appliedState ?? existing?.subscriptionState ?? null });
        if (isPaid) await keepBusinessNumbersInTransaction(tx, { businessId: input.businessId });
        else if (wasPaid) await scheduleNumberReleaseInTransaction(tx, { businessId: input.businessId });
        // Polar sends subscription.canceled when the owner cancels at the end of the period, while the plan is still live.
        if (isPaid && event.eventType === "subscription.canceled" && appliedPeriodEnd) await queuePlanCancelNoticeInTransaction(tx, { businessId: input.businessId, periodEnd: appliedPeriodEnd });
      }
    }

    // Refunds arrive as order.refunded (refund.* payloads name no business, so the webhook route drops them).
    // A support plan's orders pay for support, so they're no hosted payment and earn no commission.
    const transactionKind = event.eventType.startsWith("order.") && payload.selfHostedSupport !== true ? "order" : undefined;
    const sourceId = stringField(transactionPayload, "id", "orderId") ?? stringField(payload, "id", "orderId") ?? event.providerEventId;
    const amountCents = numberField(transactionPayload, "totalAmount", "total_amount", "amountCents", "amount") ?? numberField(payload, "totalAmount", "total_amount", "amountCents", "amount");
    const currency = stringField(transactionPayload, "currency") ?? stringField(payload, "currency");
    if (transactionKind && sourceId && amountCents !== undefined && currency) {
      const status = stringField(transactionPayload, "status") ?? stringField(payload, "status") ?? event.eventType.split(".").at(-1) ?? "received";
      const occurredAt = dateField(transactionPayload, "createdAt", "created_at", "occurredAt", "occurred_at") ?? dateField(payload, "createdAt", "created_at", "occurredAt", "occurred_at") ?? event.createdAt;
      const orderId = stringField(transactionPayload, "orderId", "order_id") ?? stringField(payload, "orderId", "order_id") ?? sourceId;
      const refundedCents = orderRefundedCents(transactionPayload, payload);
      const subscriptionId = stringField(transactionPayload, "subscriptionId", "subscription_id") ?? stringField(payload, "subscriptionId", "subscription_id");
      const polarCustomerId = stringField(transactionPayload, "customerId", "customer_id") ?? stringField(payload, "customerId", "customer_id");
      const description = stringField(transactionPayload, "description", "reason") ?? stringField(payload, "description", "reason");
      const invoiceUrl = stringField(transactionPayload, "invoiceUrl", "invoice_url") ?? stringField(payload, "invoiceUrl", "invoice_url");
      const [transaction] = await tx.insert(billingTransactions).values({
        businessId: input.businessId,
        kind: transactionKind,
        sourceId,
        status,
        amountCents,
        refundedAmountCents: refundedCents,
        currency: currency.toLowerCase(),
        ...(description ? { description } : {}),
        ...(invoiceUrl ? { invoiceUrl } : {}),
        ...(orderId ? { orderId } : {}),
        ...(subscriptionId ? { subscriptionId } : {}),
        ...(polarCustomerId ? { polarCustomerId } : {}),
        occurredAt,
        lastSyncedAt: new Date(),
      }).onConflictDoUpdate({
        target: [billingTransactions.kind, billingTransactions.sourceId],
        set: {
          businessId: input.businessId,
          status,
          amountCents,
          // Refunds only add up, so a paid event retried after a refund cannot erase it.
          refundedAmountCents: sql`greatest(${billingTransactions.refundedAmountCents}, excluded.refunded_amount_cents)`,
          currency: currency.toLowerCase(),
          ...(description ? { description } : {}),
          ...(invoiceUrl ? { invoiceUrl } : {}),
          ...(orderId ? { orderId } : {}),
          ...(subscriptionId ? { subscriptionId } : {}),
          ...(polarCustomerId ? { polarCustomerId } : {}),
          occurredAt,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      }).returning({ id: billingTransactions.id });
      if (!transaction) throw new Error("Billing transaction could not be persisted.");
      await recordAffiliateCommissionInTransaction(tx, {
        businessId: input.businessId,
        billingTransactionId: transaction.id,
        kind: transactionKind,
        sourceId,
        status,
        amountCents: amountCents - refundedCents,
        currency,
        occurredAt,
      });
    }

    // The event commits with the reconciliation that produced it. Marking the
    // provider event processed after reporting it separately would lose the
    // start for good, because no later pass detects the same transition twice.
    if (startedSubscription) {
      await recordProductEventInTransaction(tx, {
        name: "billing.subscription_started",
        distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
        businessId: input.businessId,
        actorType: "worker",
        // The taxonomy requires both, and null reads as missing: in a non-cloud
        // deployment that throws, which on this transaction would block the
        // payment itself. A first subscription has no previous plan to name.
        properties: {
          plan: startedSubscription.plan,
          billingInterval: startedSubscription.billingInterval ?? "unknown",
          previousPlan: startedSubscription.previousPlan ?? "none",
        },
      });
    }

    await tx.update(providerEvents).set({ status: billingKey ? "processed" : "ignored", updatedAt: new Date() }).where(eq(providerEvents.id, event.id));
    return { reconciled: Boolean(billingKey), started: startedSubscription };
  });

  return outcome.reconciled;
}
