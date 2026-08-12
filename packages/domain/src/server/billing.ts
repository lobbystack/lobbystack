import { and, eq, lt, or, sql } from "drizzle-orm";

import { billingAccounts, billingCheckoutRequests, billingTransactions, billingUsageEvents, businesses, enqueueOutbox, providerEvents, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { billingErrorCodes, billingPlanCatalog, billingPlanSlugs, type BillingPlanSlug } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { recordAffiliateCommissionInTransaction } from "./affiliates";
import { requireBusinessAdmin } from "../authz";

export type BillingCheckoutTarget = "starter" | "pro" | "ai_sms";
export type BillingInterval = "monthly" | "annual";

const defaultWebCallMaxDurationMs = 5 * 60 * 1_000;
const maximumWebCallMaxDurationMs = 30 * 60 * 1_000;

export type WebVoiceBillingAllowance = {
  allowed: boolean;
  errorCode: typeof billingErrorCodes.voiceLimitReached | null;
  maxDurationMs: number;
  plan: BillingPlanSlug;
};

export function normalizeWebCallMaxDurationMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return defaultWebCallMaxDurationMs;
  return Math.min(Math.floor(value), maximumWebCallMaxDurationMs);
}

function isBillingPlan(value: string | null): value is BillingPlanSlug {
  return value !== null && billingPlanSlugs.includes(value as BillingPlanSlug);
}

export function calculateWebVoiceBillingAllowance(input: {
  deploymentMode: string;
  accountPlan: string | null;
  subscriptionState: string | null;
  voiceSecondsUsed: number;
  maxDurationMs?: number;
}): WebVoiceBillingAllowance {
  const paidState = input.subscriptionState === "active" || input.subscriptionState === "trialing" || input.subscriptionState === "past_due";
  const plan: BillingPlanSlug = input.deploymentMode !== "cloud"
    ? "self_host"
    : isBillingPlan(input.accountPlan) && (input.accountPlan === "free_cloud" || paidState)
      ? input.accountPlan
      : "free_cloud";
  const requested = normalizeWebCallMaxDurationMs(input.maxDurationMs);
  const entitlement = billingPlanCatalog[plan];
  if (entitlement.voiceSecondsIncluded === null || entitlement.overagesBillable) {
    return { allowed: true, errorCode: null, maxDurationMs: requested, plan };
  }
  const remainingSeconds = Math.max(0, entitlement.voiceSecondsIncluded - input.voiceSecondsUsed);
  if (remainingSeconds < 1) {
    return { allowed: false, errorCode: billingErrorCodes.voiceLimitReached, maxDurationMs: 0, plan };
  }
  return { allowed: true, errorCode: null, maxDurationMs: Math.min(requested, Math.floor(remainingSeconds * 1_000)), plan };
}

async function loadWebVoiceBillingAllowance(
  tx: DatabaseTransaction,
  input: { businessId: string; maxDurationMs?: number },
): Promise<WebVoiceBillingAllowance> {
  const [business, account] = await Promise.all([
    tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1).then((rows) => rows[0]),
    tx.select({ plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1).then((rows) => rows[0]),
  ]);
  const periodKey = new Date().toISOString().slice(0, 7);
  const result = await tx.select({ total: sql<number>`coalesce(sum(${billingUsageEvents.quantity}), 0)` })
    .from(billingUsageEvents)
    .where(and(
      eq(billingUsageEvents.businessId, input.businessId),
      eq(billingUsageEvents.periodKey, periodKey),
      eq(billingUsageEvents.usageKind, "voice_seconds"),
    ));
  const used = Number(result[0]?.total ?? 0);
  return calculateWebVoiceBillingAllowance({
    deploymentMode: business?.deploymentMode ?? "cloud",
    accountPlan: account?.plan ?? null,
    subscriptionState: account?.subscriptionState ?? null,
    voiceSecondsUsed: used,
    ...(input.maxDurationMs !== undefined ? { maxDurationMs: input.maxDurationMs } : {}),
  });
}

export async function getWebVoiceBillingAllowance(
  context: DomainContext,
  input: { businessId: string; maxDurationMs?: number },
): Promise<WebVoiceBillingAllowance> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await loadWebVoiceBillingAllowance(tx, input));
}

export async function reserveWebVoiceUsageInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; callId: string; maxDurationMs?: number },
): Promise<WebVoiceBillingAllowance> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'web-voice-billing:' + input.businessId}, 0))`);
  const allowance = await loadWebVoiceBillingAllowance(tx, input);
  if (!allowance.allowed || allowance.plan === "self_host") return allowance;
  const syncStatus = billingPlanCatalog[allowance.plan].overagesBillable && allowance.plan !== "enterprise" ? "reserved_sync" : "reserved_skip";
  await tx.insert(billingUsageEvents).values({
    businessId: input.businessId,
    periodKey: new Date().toISOString().slice(0, 7),
    sourceKey: `voice:${input.callId}`,
    usageKind: "voice_seconds",
    quantity: allowance.maxDurationMs / 1_000,
    syncStatus,
  }).onConflictDoNothing({ target: [billingUsageEvents.businessId, billingUsageEvents.sourceKey] });
  return allowance;
}

export async function finalizeWebVoiceUsageInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; callId: string; durationSeconds: number },
): Promise<void> {
  const event = (await tx.select({ id: billingUsageEvents.id, syncStatus: billingUsageEvents.syncStatus })
    .from(billingUsageEvents)
    .where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, `voice:${input.callId}`)))
    .limit(1))[0];
  if (!event || !event.syncStatus.startsWith("reserved_")) return;
  const syncStatus = event.syncStatus === "reserved_sync" ? "pending" : "skipped";
  await tx.update(billingUsageEvents).set({ quantity: Math.max(0, input.durationSeconds), syncStatus, updatedAt: new Date() }).where(eq(billingUsageEvents.id, event.id));
  if (syncStatus === "pending") {
    await enqueueOutbox(tx, {
      topic: "billing.syncUsage",
      businessId: input.businessId,
      aggregateType: "billing_usage_event",
      aggregateId: event.id,
      dedupeKey: `billing-usage:${event.id}:sync`,
      payload: { usageEventId: event.id },
    });
  }
}

export async function createBillingCheckoutRequest(
  context: DomainContext,
  input: { userId: string; businessId: string; target: BillingCheckoutTarget; billingInterval: BillingInterval },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
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
  });
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
    }).from(billingCheckoutRequests)
      .innerJoin(users, eq(users.id, billingCheckoutRequests.requestedByUserId))
      .leftJoin(billingAccounts, eq(billingAccounts.businessId, billingCheckoutRequests.businessId))
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

export async function claimBillingCheckoutRequest(
  context: DomainContext,
  input: { businessId: string; requestId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const staleBefore = new Date(Date.now() - 10 * 60_000);
    const rows = await tx.update(billingCheckoutRequests).set({ status: "processing", updatedAt: new Date(), error: null }).where(and(
      eq(billingCheckoutRequests.id, input.requestId),
      eq(billingCheckoutRequests.businessId, input.businessId),
      or(eq(billingCheckoutRequests.status, "pending"), eq(billingCheckoutRequests.status, "error"), and(eq(billingCheckoutRequests.status, "processing"), lt(billingCheckoutRequests.updatedAt, staleBefore))),
    )).returning({ id: billingCheckoutRequests.id });
    return rows.length > 0;
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
  return value === "starter" || value === "pro" || value === "ai_sms";
}

function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export async function ensureBillingAccount(
  context: DomainContext,
  input: { businessId: string; billingKey: string; plan?: string },
): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [account] = await tx.insert(billingAccounts).values({ businessId: input.businessId, billingKey: input.billingKey, ...(input.plan !== undefined ? { plan: input.plan } : {}) }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { billingKey: input.billingKey, ...(input.plan !== undefined ? { plan: input.plan } : {}), updatedAt: new Date() } }).returning({ id: billingAccounts.id });
    if (!account) {
      throw new Error("Billing account could not be created.");
    }
    return account.id;
  });
}

export async function recordUsage(
  context: DomainContext,
  input: { businessId: string; periodKey: string; sourceKey: string; usageKind: string; quantity: number; sync?: boolean },
): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const { sync = true, ...values } = input;
    const [event] = await tx.insert(billingUsageEvents).values({ ...values, syncStatus: sync ? "pending" : "skipped" }).onConflictDoNothing().returning({ id: billingUsageEvents.id });
    if (!event) {
      const existing = await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, input.sourceKey))).limit(1);
      if (!existing[0]) {
        throw new Error("Usage event could not be recorded.");
      }
      return existing[0].id;
    }
    if (sync) {
      await enqueueOutbox(tx, {
        topic: "billing.syncUsage",
        businessId: input.businessId,
        aggregateType: "billing_usage_event",
        aggregateId: event.id,
        dedupeKey: `billing-usage:${event.id}:sync`,
        payload: { usageEventId: event.id },
      });
    }
    return event.id;
  });
}

export async function loadBillingUsageEvent(
  context: DomainContext,
  input: { businessId: string; usageEventId: string },
): Promise<{
  id: string;
  businessId: string;
  quantity: number;
  createdAt: Date;
  syncStatus: string;
  billingKey: string;
  customerId: string | null;
} | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({
      id: billingUsageEvents.id,
      businessId: billingUsageEvents.businessId,
      quantity: billingUsageEvents.quantity,
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

function dateField(source: Record<string, unknown>, ...keys: string[]): Date | undefined {
  const value = stringField(source, ...keys);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

export async function reconcileBillingProviderEvent(
  context: DomainContext,
  input: { businessId: string; providerEventId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const event = (await tx.select({ id: providerEvents.id, providerEventId: providerEvents.providerEventId, eventType: providerEvents.eventType, status: providerEvents.status, payload: providerEvents.payload, createdAt: providerEvents.createdAt })
      .from(providerEvents)
      .where(and(eq(providerEvents.id, input.providerEventId), eq(providerEvents.businessId, input.businessId)))
      .limit(1))[0];
    if (!event) return false;
    if (event.status === "processed") return true;

    const payload = recordObject(event.payload);
    const transactionPayload = recordObject(payload.order ?? payload.refund ?? payload);
    const customer = recordObject(payload.customer);
    const subscription = recordObject(payload.subscription);
    const product = recordObject(subscription.product ?? payload.product);
    const existing = (await tx.select({
      billingKey: billingAccounts.billingKey,
      customerId: billingAccounts.customerId,
      subscriptionId: billingAccounts.subscriptionId,
    }).from(billingAccounts).where(eq(billingAccounts.businessId, input.businessId)).limit(1))[0];
    const billingKey = stringField(transactionPayload, "billingKey", "externalCustomerId", "customerId") ?? stringField(payload, "billingKey", "externalCustomerId", "customerId") ?? stringField(customer, "id", "externalId") ?? existing?.billingKey;
    if (billingKey) {
      const customerId = stringField(transactionPayload, "customerId", "externalCustomerId") ?? stringField(payload, "customerId", "externalCustomerId") ?? stringField(customer, "id", "externalId") ?? existing?.customerId;
      const subscriptionId = stringField(transactionPayload, "subscriptionId", "subscription_id") ?? stringField(payload, "subscriptionId", "subscription_id") ?? stringField(subscription, "id") ?? existing?.subscriptionId;
      const plan = stringField(transactionPayload, "plan") ?? stringField(payload, "plan") ?? stringField(product, "name", "slug");
      const subscriptionState = stringField(transactionPayload, "subscriptionState", "status") ?? stringField(payload, "subscriptionState", "status") ?? (event.eventType.startsWith("subscription.") ? event.eventType.slice("subscription.".length) : undefined);
      const currentPeriodStart = dateField(transactionPayload, "currentPeriodStart", "current_period_start") ?? dateField(payload, "currentPeriodStart", "current_period_start") ?? dateField(subscription, "currentPeriodStart", "current_period_start");
      const currentPeriodEnd = dateField(transactionPayload, "currentPeriodEnd", "current_period_end") ?? dateField(payload, "currentPeriodEnd", "current_period_end") ?? dateField(subscription, "currentPeriodEnd", "current_period_end");
      await tx.insert(billingAccounts).values({
        businessId: input.businessId,
        billingKey,
        ...(customerId ? { customerId } : {}),
        ...(subscriptionId ? { subscriptionId } : {}),
        ...(plan ? { plan } : {}),
        ...(subscriptionState ? { subscriptionState } : {}),
        ...(currentPeriodStart ? { currentPeriodStart } : {}),
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      }).onConflictDoUpdate({
        target: billingAccounts.businessId,
        set: {
          billingKey,
          ...(customerId ? { customerId } : {}),
          ...(subscriptionId ? { subscriptionId } : {}),
          ...(plan ? { plan } : {}),
          ...(subscriptionState ? { subscriptionState } : {}),
          ...(currentPeriodStart ? { currentPeriodStart } : {}),
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
          updatedAt: new Date(),
        },
      });
    }

    const transactionKind = event.eventType.startsWith("order.") ? "order" : event.eventType.startsWith("refund.") ? "refund" : undefined;
    const sourceId = stringField(transactionPayload, "id", "orderId", "refundId") ?? stringField(payload, "id", "orderId", "refundId") ?? event.providerEventId;
    const amountCents = numberField(transactionPayload, "totalAmount", "total_amount", "amountCents", "amount") ?? numberField(payload, "totalAmount", "total_amount", "amountCents", "amount");
    const currency = stringField(transactionPayload, "currency") ?? stringField(payload, "currency");
    if (transactionKind && sourceId && amountCents !== undefined && currency) {
      const status = stringField(transactionPayload, "status") ?? stringField(payload, "status") ?? event.eventType.split(".").at(-1) ?? "received";
      const occurredAt = dateField(transactionPayload, "createdAt", "created_at", "occurredAt", "occurred_at") ?? dateField(payload, "createdAt", "created_at", "occurredAt", "occurred_at") ?? event.createdAt;
      const orderId = stringField(transactionPayload, "orderId", "order_id") ?? stringField(payload, "orderId", "order_id") ?? (transactionKind === "order" ? sourceId : undefined);
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
        amountCents,
        currency,
        ...(orderId ? { orderId } : {}),
        occurredAt,
      });
    }

    await tx.update(providerEvents).set({ status: billingKey ? "processed" : "ignored", updatedAt: new Date() }).where(eq(providerEvents.id, event.id));
    return Boolean(billingKey);
  });
}
