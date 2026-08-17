import { and, asc, eq, sql } from "drizzle-orm";

import { billingAccounts, billingUsageEvents, billingUsageMonths, businesses, enqueueOutbox, type DatabaseTransaction } from "@lobbystack/db";
import { billingErrorCodes, billingPlanCatalog, billingPlanSlugs, type BillingPlanSlug } from "@lobbystack/shared";

export type NonAiBillingUsageKind = "voice_seconds" | "alert_sms_segments" | "outbound_call_attempts" | "chat_ai_tokens";

type UsageCounts = Record<NonAiBillingUsageKind, number>;

export type UsageReservationResult = {
  allowed: boolean;
  errorCode: string | null;
  usageEventId?: string;
  syncNeeded: boolean;
  periodKey: string;
  plan: BillingPlanSlug;
  quantity?: number;
};

export type UsageStatus = {
  periodKey: string;
  plan: BillingPlanSlug;
  voiceSecondsUsed: number;
  alertSmsSegmentsUsed: number;
  outboundCallAttemptsUsed: number;
  chatAiTokensUsed: number;
  voiceSecondsIncluded: number | null;
  alertSmsSegmentsIncluded: number | null;
  outboundCallAttemptsIncluded: number | null;
  chatAiTokensIncluded: number | null;
  voiceBlocked: boolean;
  alertSmsBlocked: boolean;
  outboundCallAttemptsBlocked: boolean;
  chatAiBlocked: boolean;
  overageSpendCents: number;
  overageSpendingCapCents: number | null;
  overageSpendingCapReached: boolean;
  usageComplete: boolean;
};

const emptyUsage: UsageCounts = {
  voice_seconds: 0,
  alert_sms_segments: 0,
  outbound_call_attempts: 0,
  chat_ai_tokens: 0,
};

const GSM_BASIC = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ`¿abcdefghijklmnopqrstuvwxyzäöñüà"));
const GSM_EXTENDED = new Set(["^", "{", "}", "\\", "[", "~", "]", "|", "€"]);

export function periodKeyFor(value = new Date()): string {
  return value.toISOString().slice(0, 7);
}

export function estimateSmsSegments(body: string): number {
  let septets = 0;
  for (const character of body) {
    if (GSM_BASIC.has(character)) septets += 1;
    else if (GSM_EXTENDED.has(character)) septets += 2;
    else {
      const codePointLength = Array.from(body).length;
      return codePointLength <= 70 ? 1 : Math.max(1, Math.ceil(codePointLength / 67));
    }
  }
  return septets <= 160 ? 1 : Math.max(1, Math.ceil(septets / 153));
}

function isBillingPlan(value: string | null | undefined): value is BillingPlanSlug {
  return value !== null && value !== undefined && billingPlanSlugs.includes(value as BillingPlanSlug);
}

export function effectiveBillingPlan(input: { deploymentMode: string; accountPlan: string | null; subscriptionState: string | null }): BillingPlanSlug {
  if (input.deploymentMode !== "cloud") return "self_host";
  const paidState = input.subscriptionState === "active" || input.subscriptionState === "trialing" || input.subscriptionState === "past_due";
  if (isBillingPlan(input.accountPlan) && (input.accountPlan === "free_cloud" || paidState)) return input.accountPlan;
  return "free_cloud";
}

function includedQuantity(plan: BillingPlanSlug, kind: NonAiBillingUsageKind): number | null {
  const config = billingPlanCatalog[plan];
  if (kind === "voice_seconds") return config.voiceSecondsIncluded;
  if (kind === "alert_sms_segments") return config.alertSmsSegmentsIncluded;
  if (kind === "chat_ai_tokens") return config.chatAiTokensIncluded;
  return config.outboundCallAttemptsIncluded;
}

function rateCents(plan: BillingPlanSlug, kind: NonAiBillingUsageKind): number {
  const config = billingPlanCatalog[plan];
  if (kind === "voice_seconds") return (config.voiceOverageRatePerMinuteCents ?? 0) / 60;
  if (kind === "alert_sms_segments") return config.alertSmsOverageRatePerSegmentCents ?? 0;
  return config.outboundCallAttemptOverageRateCents ?? 0;
}

function usageForKind(usage: UsageCounts, kind: NonAiBillingUsageKind): number {
  return usage[kind];
}

function overageSpendFor(plan: BillingPlanSlug, kind: NonAiBillingUsageKind, quantity: number): number {
  const included = includedQuantity(plan, kind);
  if (!billingPlanCatalog[plan].overagesBillable || included === null) return 0;
  return Math.max(0, quantity - included) * rateCents(plan, kind);
}

type ReplayEvent = {
  sourceKey: string;
  quantity: number;
  usageKind: string;
  planAtRecordTime: string | null;
  billingIntervalAtRecordTime: string | null;
  createdAt: Date;
  isFinal: boolean;
};

function replayEvents(events: ReplayEvent[], fallbackPlan: BillingPlanSlug): { usage: UsageCounts; rawSpendCents: number } {
  const usage = { ...emptyUsage };
  let rawSpendCents = 0;
  for (const event of [...events].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
    if (!(event.usageKind in usage)) continue;
    const kind = event.usageKind as NonAiBillingUsageKind;
    const plan = isBillingPlan(event.planAtRecordTime) ? event.planAtRecordTime : fallbackPlan;
    const before = usageForKind(usage, kind);
    const after = before + Math.max(0, event.quantity);
    usage[kind] = after;
    rawSpendCents += overageSpendFor(plan, kind, after) - overageSpendFor(plan, kind, before);
  }
  return { usage, rawSpendCents: Math.max(0, rawSpendCents) };
}

async function loadBillingContext(tx: DatabaseTransaction, businessId: string): Promise<{ plan: BillingPlanSlug; capCents: number | null; billingInterval: string | null }> {
  const [business, account] = await Promise.all([
    tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1).then((rows) => rows[0]),
    tx.select({ plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState, overageSpendingCapCents: billingAccounts.overageSpendingCapCents, billingInterval: billingAccounts.billingInterval }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1).then((rows) => rows[0]),
  ]);
  return {
    plan: effectiveBillingPlan({ deploymentMode: business?.deploymentMode ?? "cloud", accountPlan: account?.plan ?? null, subscriptionState: account?.subscriptionState ?? null }),
    capCents: account?.overageSpendingCapCents ?? null,
    billingInterval: account?.billingInterval ?? null,
  };
}

async function loadEvents(tx: DatabaseTransaction, businessId: string, periodKey: string): Promise<ReplayEvent[]> {
  return await tx.select({ sourceKey: billingUsageEvents.sourceKey, quantity: billingUsageEvents.quantity, usageKind: billingUsageEvents.usageKind, planAtRecordTime: billingUsageEvents.planAtRecordTime, billingIntervalAtRecordTime: billingUsageEvents.billingIntervalAtRecordTime, createdAt: billingUsageEvents.createdAt, isFinal: billingUsageEvents.isFinal })
    .from(billingUsageEvents)
    .where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.periodKey, periodKey)))
    .orderBy(asc(billingUsageEvents.createdAt));
}

function billableQuantityForEvent(events: ReplayEvent[], sourceKey: string, fallbackPlan: BillingPlanSlug): number {
  const ordered = [...events].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const running: UsageCounts = { ...emptyUsage };
  for (const event of ordered) {
    if (!(event.usageKind in running)) continue;
    const kind = event.usageKind as NonAiBillingUsageKind;
    const plan = isBillingPlan(event.planAtRecordTime) ? event.planAtRecordTime : fallbackPlan;
    const included = includedQuantity(plan, kind);
    const before = running[kind];
    const after = before + Math.max(0, event.quantity);
    running[kind] = after;
    if (event.sourceKey !== sourceKey) continue;
    if (event.billingIntervalAtRecordTime !== "annual" || (plan !== "starter" && plan !== "pro") || included === null) return Math.max(0, event.quantity);
    return Math.max(0, after - included) - Math.max(0, before - included);
  }
  return 0;
}

async function ensureUsageMonth(tx: DatabaseTransaction, businessId: string, periodKey: string, plan: BillingPlanSlug): Promise<void> {
  await tx.insert(billingUsageMonths).values({ businessId, periodKey, planAtSnapshot: plan }).onConflictDoNothing({ target: [billingUsageMonths.businessId, billingUsageMonths.periodKey] });
}

async function refreshUsageMonth(tx: DatabaseTransaction, input: { businessId: string; periodKey: string; plan: BillingPlanSlug; capCents: number | null; events?: ReplayEvent[] }): Promise<UsageStatus> {
  const events = input.events ?? await loadEvents(tx, input.businessId, input.periodKey);
  const replay = replayEvents(events, input.plan);
  const config = billingPlanCatalog[input.plan];
  const overageSpendCents = Math.max(0, Math.ceil(replay.rawSpendCents - 1e-9));
  const capReached = input.capCents !== null && replay.rawSpendCents > 0 && overageSpendCents >= input.capCents;
  const status: UsageStatus = {
    periodKey: input.periodKey,
    plan: input.plan,
    voiceSecondsUsed: replay.usage.voice_seconds,
    alertSmsSegmentsUsed: replay.usage.alert_sms_segments,
    outboundCallAttemptsUsed: replay.usage.outbound_call_attempts,
    chatAiTokensUsed: replay.usage.chat_ai_tokens,
    voiceSecondsIncluded: config.voiceSecondsIncluded,
    alertSmsSegmentsIncluded: config.alertSmsSegmentsIncluded,
    outboundCallAttemptsIncluded: config.outboundCallAttemptsIncluded,
    chatAiTokensIncluded: config.chatAiTokensIncluded,
    voiceBlocked: (!config.overagesBillable && config.voiceSecondsIncluded !== null && replay.usage.voice_seconds >= config.voiceSecondsIncluded) || capReached,
    alertSmsBlocked: (!config.overagesBillable && config.alertSmsSegmentsIncluded !== null && replay.usage.alert_sms_segments >= config.alertSmsSegmentsIncluded) || capReached,
    outboundCallAttemptsBlocked: (!config.overagesBillable && config.outboundCallAttemptsIncluded !== null && replay.usage.outbound_call_attempts >= config.outboundCallAttemptsIncluded) || capReached,
    chatAiBlocked: (!config.overagesBillable && config.chatAiTokensIncluded !== null && replay.usage.chat_ai_tokens >= config.chatAiTokensIncluded) || capReached,
    overageSpendCents,
    overageSpendingCapCents: input.capCents,
    overageSpendingCapReached: capReached,
    usageComplete: events.every((event) => event.isFinal),
  };
  await ensureUsageMonth(tx, input.businessId, input.periodKey, input.plan);
  await tx.update(billingUsageMonths).set({
    planAtSnapshot: input.plan,
    voiceSecondsUsed: status.voiceSecondsUsed,
    alertSmsSegmentsUsed: status.alertSmsSegmentsUsed,
    outboundCallAttemptsUsed: status.outboundCallAttemptsUsed,
    chatAiTokensUsed: status.chatAiTokensUsed,
    voiceBlocked: status.voiceBlocked,
    alertSmsBlocked: status.alertSmsBlocked,
    outboundCallAttemptsBlocked: status.outboundCallAttemptsBlocked,
    chatAiBlocked: status.chatAiBlocked,
    overageSpendCents: status.overageSpendCents,
    lastRecordedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(billingUsageMonths.businessId, input.businessId), eq(billingUsageMonths.periodKey, input.periodKey)));
  return status;
}

export async function getUsageStatusInTransaction(tx: DatabaseTransaction, input: { businessId: string; periodKey?: string }): Promise<UsageStatus> {
  const periodKey = input.periodKey ?? periodKeyFor();
  const billing = await loadBillingContext(tx, input.businessId);
  return await refreshUsageMonth(tx, { businessId: input.businessId, periodKey, plan: billing.plan, capCents: billing.capCents });
}

export async function reserveUsageInTransaction(tx: DatabaseTransaction, input: { businessId: string; usageKind: NonAiBillingUsageKind; sourceKey: string; quantity?: number; recordedAt?: Date }): Promise<UsageReservationResult> {
  const recordedAt = input.recordedAt ?? new Date();
  const periodKey = periodKeyFor(recordedAt);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing-usage:${input.businessId}:${periodKey}`}, 0))`);
  const billing = await loadBillingContext(tx, input.businessId);
  const existing = (await tx.select({ id: billingUsageEvents.id, quantity: billingUsageEvents.quantity, syncStatus: billingUsageEvents.syncStatus }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, input.sourceKey))).limit(1))[0];
  if (existing && existing.quantity > 0) return { allowed: true, errorCode: null, usageEventId: existing.id, syncNeeded: existing.syncStatus === "pending", periodKey, plan: billing.plan, quantity: existing.quantity };
  const events = await loadEvents(tx, input.businessId, periodKey);
  const current = replayEvents(events, billing.plan);
  let quantity = input.quantity;
  if (quantity === undefined && input.usageKind === "voice_seconds") {
    const included = includedQuantity(billing.plan, input.usageKind);
    const remainingIncluded = included === null ? 0 : Math.max(0, included - current.usage.voice_seconds);
    const remainingCap = billing.capCents === null ? 0 : Math.max(0, billing.capCents - current.rawSpendCents);
    const capSeconds = rateCents(billing.plan, input.usageKind) > 0 ? Math.floor(remainingCap / rateCents(billing.plan, input.usageKind)) : 0;
    quantity = billingPlanCatalog[billing.plan].overagesBillable ? (billing.capCents === null ? 0 : remainingIncluded + capSeconds) : remainingIncluded;
  }
  quantity = Math.max(0, quantity ?? 0);
  if (quantity <= 0) {
    const unlimitedVoice = input.usageKind === "voice_seconds" && (billing.plan === "self_host" || (billingPlanCatalog[billing.plan].overagesBillable && billing.capCents === null));
    if (unlimitedVoice) return { allowed: true, errorCode: null, syncNeeded: false, periodKey, plan: billing.plan };
    const errorCode = input.usageKind === "voice_seconds" ? billingErrorCodes.voiceLimitReached : input.usageKind === "alert_sms_segments" ? billingErrorCodes.alertSmsLimitReached : input.usageKind === "chat_ai_tokens" ? billingErrorCodes.chatAiLimitReached : billingErrorCodes.outboundCallAttemptLimitReached;
    return { allowed: false, errorCode, syncNeeded: false, periodKey, plan: billing.plan };
  }
  const included = includedQuantity(billing.plan, input.usageKind);
  if (!billingPlanCatalog[billing.plan].overagesBillable && included !== null && current.usage[input.usageKind] + quantity > included) {
    const errorCode = input.usageKind === "voice_seconds" ? billingErrorCodes.voiceLimitReached : input.usageKind === "alert_sms_segments" ? billingErrorCodes.alertSmsLimitReached : input.usageKind === "chat_ai_tokens" ? billingErrorCodes.chatAiLimitReached : billingErrorCodes.outboundCallAttemptLimitReached;
    return { allowed: false, errorCode, syncNeeded: false, periodKey, plan: billing.plan };
  }
  const eventPayload = { sourceKey: input.sourceKey, quantity, usageKind: input.usageKind, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, createdAt: recordedAt, isFinal: input.usageKind === "outbound_call_attempts" };
  const simulated = replayEvents([...events, eventPayload], billing.plan);
  if (billing.capCents !== null && simulated.rawSpendCents > billing.capCents) {
    const errorCode = input.usageKind === "voice_seconds" ? billingErrorCodes.voiceLimitReached : input.usageKind === "alert_sms_segments" ? billingErrorCodes.alertSmsLimitReached : input.usageKind === "chat_ai_tokens" ? billingErrorCodes.chatAiLimitReached : billingErrorCodes.outboundCallAttemptLimitReached;
    return { allowed: false, errorCode, syncNeeded: false, periodKey, plan: billing.plan };
  }
  const syncNeeded = billing.plan === "starter" || billing.plan === "pro";
  const billableQuantity = billableQuantityForEvent([...events.filter((row) => row.sourceKey !== input.sourceKey), eventPayload], input.sourceKey, billing.plan);
  const [event] = existing
    ? await tx.update(billingUsageEvents).set({ quantity, billableQuantity, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, isFinal: eventPayload.isFinal, syncStatus: syncNeeded ? "pending" : "skipped", updatedAt: new Date() }).where(eq(billingUsageEvents.id, existing.id)).returning({ id: billingUsageEvents.id })
    : await tx.insert(billingUsageEvents).values({ businessId: input.businessId, periodKey, sourceKey: input.sourceKey, usageKind: input.usageKind, quantity, billableQuantity, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, isFinal: eventPayload.isFinal, syncStatus: syncNeeded ? "pending" : "skipped", createdAt: recordedAt, updatedAt: new Date() }).returning({ id: billingUsageEvents.id });
  if (!event) throw new Error("Billing usage event could not be recorded.");
  await refreshUsageMonth(tx, { businessId: input.businessId, periodKey, plan: billing.plan, capCents: billing.capCents, events: [...events.filter((row) => row.sourceKey !== input.sourceKey), eventPayload] });
  return { allowed: true, errorCode: null, usageEventId: event.id, syncNeeded, periodKey, plan: billing.plan, quantity };
}

export async function correctUsageInTransaction(tx: DatabaseTransaction, input: { businessId: string; sourceKey: string; usageKind: NonAiBillingUsageKind; quantity: number; recordedAt?: Date }): Promise<string> {
  const recordedAt = input.recordedAt ?? new Date();
  const existingBeforeLock = (await tx.select({ id: billingUsageEvents.id, periodKey: billingUsageEvents.periodKey }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, input.sourceKey))).limit(1))[0];
  const periodKey = existingBeforeLock?.periodKey ?? periodKeyFor(recordedAt);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing-usage:${input.businessId}:${periodKey}`}, 0))`);
  const billing = await loadBillingContext(tx, input.businessId);
  const existing = (await tx.select({ id: billingUsageEvents.id, periodKey: billingUsageEvents.periodKey, planAtRecordTime: billingUsageEvents.planAtRecordTime, billingIntervalAtRecordTime: billingUsageEvents.billingIntervalAtRecordTime, createdAt: billingUsageEvents.createdAt }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, input.sourceKey))).limit(1))[0];
  let eventId: string;
  if (existing) {
    const events = await loadEvents(tx, input.businessId, periodKey);
    const replacement: ReplayEvent = { sourceKey: input.sourceKey, quantity: Math.max(0, input.quantity), usageKind: input.usageKind, planAtRecordTime: existing.planAtRecordTime ?? billing.plan, billingIntervalAtRecordTime: existing.billingIntervalAtRecordTime ?? billing.billingInterval, createdAt: existing.createdAt, isFinal: true };
    const billableQuantity = billableQuantityForEvent([...events.filter((row) => row.sourceKey !== input.sourceKey), replacement], input.sourceKey, billing.plan);
    await tx.update(billingUsageEvents).set({ quantity: Math.max(0, input.quantity), billableQuantity, isFinal: true, syncStatus: billing.plan === "starter" || billing.plan === "pro" ? "pending" : "skipped", updatedAt: new Date() }).where(eq(billingUsageEvents.id, existing.id));
    eventId = existing.id;
  } else {
    const replacement: ReplayEvent = { sourceKey: input.sourceKey, quantity: Math.max(0, input.quantity), usageKind: input.usageKind, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, createdAt: recordedAt, isFinal: true };
    const events = await loadEvents(tx, input.businessId, periodKey);
    const billableQuantity = billableQuantityForEvent([...events, replacement], input.sourceKey, billing.plan);
    const [event] = await tx.insert(billingUsageEvents).values({ businessId: input.businessId, periodKey, sourceKey: input.sourceKey, usageKind: input.usageKind, quantity: Math.max(0, input.quantity), billableQuantity, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, isFinal: true, syncStatus: billing.plan === "starter" || billing.plan === "pro" ? "pending" : "skipped", createdAt: recordedAt, updatedAt: new Date() }).returning({ id: billingUsageEvents.id });
    if (!event) throw new Error("Billing usage correction could not be recorded.");
    eventId = event.id;
  }
  await refreshUsageMonth(tx, { businessId: input.businessId, periodKey, plan: billing.plan, capCents: billing.capCents });
  return eventId;
}

export async function enqueueUsageSyncInTransaction(tx: DatabaseTransaction, input: { businessId: string; usageEventId: string }): Promise<void> {
  const event = (await tx.select({ quantity: billingUsageEvents.quantity, syncStatus: billingUsageEvents.syncStatus }).from(billingUsageEvents).where(and(eq(billingUsageEvents.id, input.usageEventId), eq(billingUsageEvents.businessId, input.businessId))).limit(1))[0];
  if (!event || event.syncStatus !== "pending") return;
  await enqueueOutbox(tx, {
    topic: "billing.syncUsage",
    businessId: input.businessId,
    aggregateType: "billing_usage_event",
    aggregateId: input.usageEventId,
    dedupeKey: `billing-usage:${input.usageEventId}:sync:${event.quantity}`,
    payload: { usageEventId: input.usageEventId },
  });
}
