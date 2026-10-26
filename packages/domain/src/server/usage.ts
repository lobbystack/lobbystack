import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import { billingUsageEvents, billingUsageMonths, calls, enqueueOutbox, type DatabaseTransaction } from "@lobbystack/db";
import { billingErrorCodes, billingPlanSlugs, isBillingPlanSlug, MAX_PHONE_CALL_MS, PHONE_RESERVATION_SLICE_SECONDS, planEntitlement, type BillingPlanSlug, type Entitlement } from "@lobbystack/shared";

import { queueBusinessAllowanceAlertsInTransaction } from "./businessAllowanceAlerts";
import { loadBusinessBilling, type BusinessBilling } from "./entitlement";
import { isPoolUsageKind, lockPartnerPoolInTransaction, partnerCallsFullInTransaction, poolChangeFor, poolLeft, readPartnerPoolInTransaction, recordPartnerPoolUsageInTransaction, type PooledEvent, type PoolState, type PoolTerms } from "./partnerPool";
import { queuePartnerPoolAlertsInTransaction } from "./partnerPoolAlerts";

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

/** The allowance and overage terms usage is counted and priced against, and where they come from when known. */
type UsageTerms = Pick<Entitlement, "allowance" | "overage"> & Partial<Pick<Entitlement, "source">>;

/** The business's plan now and its entitlement's terms. */
type CurrentTerms = { plan: BillingPlanSlug; entitlement: UsageTerms };

/**
 * The terms in force when usage happened, as its event records them: the
 * business's allowance and overage, and its partner's pool when the usage
 * draws on one. A sync job prices the event by these, never by terms that
 * changed later.
 */
export type RecordedUsageTerms = Pick<Entitlement, "source" | "allowance" | "overage"> & { pool: PoolTerms | null };

function recordedTerms(entitlement: Entitlement, pool: PoolState | null): RecordedUsageTerms {
  return { source: entitlement.source, allowance: entitlement.allowance, overage: entitlement.overage, pool: pool?.terms ?? null };
}

/** The pool terms an event recorded, or the pool's terms now for an event recorded before events kept them. */
function recordedPoolTerms(terms: unknown, pool: PoolState): PoolTerms {
  const recorded = (terms as Partial<RecordedUsageTerms> | null)?.pool;
  return recorded && recorded.partnerId === pool.partnerId ? recorded : pool.terms;
}

function limitReached(kind: NonAiBillingUsageKind): string {
  if (kind === "voice_seconds") return billingErrorCodes.voiceLimitReached;
  if (kind === "alert_sms_segments") return billingErrorCodes.alertSmsLimitReached;
  if (kind === "chat_ai_tokens") return billingErrorCodes.chatAiLimitReached;
  return billingErrorCodes.outboundCallAttemptLimitReached;
}

// Events record the plan they were used on. One recorded under another plan keeps that plan's catalog terms.
const planTerms = Object.fromEntries(billingPlanSlugs.map((plan) => [plan, planEntitlement(plan)])) as Record<BillingPlanSlug, Entitlement>;

/** Whether the current terms are a partner's business's, whose events record the package terms they were used on. */
function isPartnerBusiness(current: CurrentTerms): boolean {
  return current.entitlement.source === "package" || current.entitlement.source === "billed_outside";
}

/**
 * The package terms an event of a partner's business recorded, or null for
 * any other event. A partner's business prices each event by them, so a
 * rate the partner changes later doesn't reprice usage that already
 * happened. A business that left its partner prices none of them.
 */
function recordedPackageTerms(current: CurrentTerms, recorded: unknown): UsageTerms | null {
  if (!isPartnerBusiness(current)) return null;
  const terms = recorded as Partial<RecordedUsageTerms> | null | undefined;
  return terms?.source === "package" && terms.allowance && terms.overage ? { source: "package", allowance: terms.allowance, overage: terms.overage } : null;
}

/**
 * The terms an event is priced by: the business's entitlement for usage on
 * its current plan, or on no recorded plan, except that a partner's business
 * prices the usage it had on a package by the terms the event recorded.
 */
function termsFor(current: CurrentTerms, event: Pick<ReplayEvent, "planAtRecordTime" | "termsAtRecordTime">): UsageTerms {
  const plan = isBillingPlanSlug(event.planAtRecordTime) ? event.planAtRecordTime : current.plan;
  if (plan !== current.plan) return planTerms[plan];
  return recordedPackageTerms(current, event.termsAtRecordTime) ?? current.entitlement;
}

/** The package terms an event of a business on a package is priced by: those it recorded, or the business's own now when it recorded none. */
function packageTermsFor(current: CurrentTerms, recorded: unknown): UsageTerms | null {
  return recordedPackageTerms(current, recorded) ?? (current.entitlement.source === "package" ? current.entitlement : null);
}

function includedQuantity(terms: UsageTerms, kind: NonAiBillingUsageKind): number | null {
  if (kind === "voice_seconds") return terms.allowance.voiceSeconds;
  if (kind === "alert_sms_segments") return terms.allowance.alertSms;
  if (kind === "chat_ai_tokens") return terms.allowance.chats;
  return terms.allowance.outboundAttempts;
}

/**
 * Whether the overage cap stops this kind of usage: only usage the allowance
 * limits. Alert texts and transfer attempts, which a package doesn't sell,
 * have no limit there, so a business past its cap still sends them, as it
 * does once its partner's pool runs out.
 */
function capLimits(terms: UsageTerms, kind: NonAiBillingUsageKind): boolean {
  return includedQuantity(terms, kind) !== null;
}

function rateCents(terms: UsageTerms, kind: NonAiBillingUsageKind): number {
  if (kind === "voice_seconds") return terms.overage.rates.voiceMinute / 60;
  if (kind === "alert_sms_segments") return terms.overage.rates.alertSms;
  if (kind === "chat_ai_tokens") return terms.overage.rates.chat;
  return terms.overage.rates.outboundAttempt;
}

function overageSpendFor(terms: UsageTerms, kind: NonAiBillingUsageKind, quantity: number): number {
  const included = includedQuantity(terms, kind);
  if (!terms.overage.enabled || included === null) return 0;
  return Math.max(0, quantity - included) * rateCents(terms, kind);
}

type ReplayEvent = {
  sourceKey: string;
  quantity: number;
  usageKind: string;
  planAtRecordTime: string | null;
  billingIntervalAtRecordTime: string | null;
  createdAt: Date;
  isFinal: boolean;
  /** The terms the event recorded, read only for a partner's business. */
  termsAtRecordTime?: unknown;
};

/**
 * The month's usage by kind, and what its overage costs before rounding, in
 * the minor unit of the business's currency. Each event is priced by its
 * terms against the usage before it, so a package business's open
 * reservations count against its cap at the minute rate too.
 */
export function replayEvents(events: ReplayEvent[], current: CurrentTerms): { usage: UsageCounts; rawSpendCents: number } {
  const usage = { ...emptyUsage };
  let rawSpendCents = 0;
  for (const event of [...events].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
    if (!(event.usageKind in usage)) continue;
    const kind = event.usageKind as NonAiBillingUsageKind;
    const terms = termsFor(current, event);
    const before = usage[kind];
    const after = before + Math.max(0, event.quantity);
    usage[kind] = after;
    rawSpendCents += overageSpendFor(terms, kind, after) - overageSpendFor(terms, kind, before);
  }
  return { usage, rawSpendCents: Math.max(0, rawSpendCents) };
}

/** What usage metering reads for a business: its entitlement, and the plan and interval each event records. */
type BillingContext = BusinessBilling;

// Reservations, top-ups and corrections in a business's billing period run one at a time.
async function lockUsagePeriod(tx: DatabaseTransaction, businessId: string, periodKey: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing-usage:${businessId}:${periodKey}`}, 0))`);
}

/**
 * The voice seconds a business can still use this period: its included
 * seconds left, plus what the overage cap still pays for at the exact spend.
 * Infinity for an entitlement with no voice limit (self-host, enterprise) or
 * billable overage with no cap or no price; those calls reserve nothing
 * unless a partner's pool counts them. Phone
 * reservations and browser call limits both use this rule.
 */
export function voiceSecondsLeft(terms: UsageTerms, current: { usage: UsageCounts; rawSpendCents: number }): number {
  const included = includedQuantity(terms, "voice_seconds");
  const { enabled: overagesBillable, capMinor: capCents } = terms.overage;
  if (included === null || (overagesBillable && capCents === null)) return Number.POSITIVE_INFINITY;
  const remainingIncluded = Math.max(0, included - current.usage.voice_seconds);
  if (!overagesBillable || capCents === null) return remainingIncluded;
  // Past the cap a reservation is refused even for included seconds.
  if (current.rawSpendCents > capCents) return 0;
  const rate = rateCents(terms, "voice_seconds");
  // Seconds past the allowance that cost nothing, as at a package's rate of 0, spend none of the cap.
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  return remainingIncluded + Math.floor((capCents - current.rawSpendCents) / rate);
}

export async function loadBillingContext(tx: DatabaseTransaction, businessId: string): Promise<BillingContext> {
  return await loadBusinessBilling(tx, businessId);
}

/** The month's events, with the terms each recorded when a partner's business prices them by those. */
async function loadEvents(tx: DatabaseTransaction, businessId: string, periodKey: string, current: CurrentTerms): Promise<ReplayEvent[]> {
  const columns = { sourceKey: billingUsageEvents.sourceKey, quantity: billingUsageEvents.quantity, usageKind: billingUsageEvents.usageKind, planAtRecordTime: billingUsageEvents.planAtRecordTime, billingIntervalAtRecordTime: billingUsageEvents.billingIntervalAtRecordTime, createdAt: billingUsageEvents.createdAt, isFinal: billingUsageEvents.isFinal };
  return await tx.select(isPartnerBusiness(current) ? { ...columns, termsAtRecordTime: billingUsageEvents.termsAtRecordTime } : columns)
    .from(billingUsageEvents)
    .where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.periodKey, periodKey)))
    .orderBy(asc(billingUsageEvents.createdAt));
}

// Annual plans send Polar each event's share of the month's overage once it is
// final. Only the other final events have been billed, so open reservations
// never count against this one. An event that was already final keeps what it
// billed and moves only by its own change.
export function billableQuantityForEvent(others: ReplayEvent[], event: ReplayEvent, current: CurrentTerms, billed?: { quantity: number; billableQuantity: number }): number {
  const plan = isBillingPlanSlug(event.planAtRecordTime) ? event.planAtRecordTime : current.plan;
  const included = includedQuantity(termsFor(current, event), event.usageKind as NonAiBillingUsageKind);
  if (event.billingIntervalAtRecordTime !== "annual" || (plan !== "starter" && plan !== "pro") || included === null) return Math.max(0, event.quantity);
  const before = others.reduce((sum, row) => (row.isFinal && row.usageKind === event.usageKind ? sum + Math.max(0, row.quantity) : sum), 0);
  const overage = (quantity: number) => Math.max(0, before + Math.max(0, quantity) - included);
  return billed ? Math.max(0, billed.billableQuantity + overage(event.quantity) - overage(billed.quantity)) : overage(event.quantity) - overage(0);
}

/** What a business on a package owes its partner for one event: the usage past its allowance, and what that costs at the event's rates. */
export type BusinessOverage = { quantity: number; minor: number };

/**
 * What a final event of a business on a package puts past the business's
 * own allowance, and what that costs the business at the terms the event
 * recorded, in the minor unit of the package's currency. The month's other
 * final usage counts first, so overage goes to usage that ended past the
 * allowance, never to a call that's still open. An event that was already
 * final moves only by its own change. Usage past the allowance costs nothing
 * while the terms bill no overage. Null for usage a package doesn't sell,
 * which is anything but minutes and chats, and for a business on no package.
 */
export function businessOverageFor(others: ReplayEvent[], event: { usageKind: string; quantity: number }, terms: UsageTerms | null, previous: { quantity: number; overageQuantity: number } | null): BusinessOverage | null {
  if (terms?.source !== "package" || (event.usageKind !== "voice_seconds" && event.usageKind !== "chat_ai_tokens")) return null;
  const included = includedQuantity(terms, event.usageKind);
  if (included === null) return null;
  const before = others.reduce((sum, row) => (row.isFinal && row.usageKind === event.usageKind ? sum + Math.max(0, row.quantity) : sum), 0);
  const past = (quantity: number) => Math.max(0, before + Math.max(0, quantity) - included);
  if (!terms.overage.enabled) return { quantity: 0, minor: 0 };
  const quantity = previous ? Math.max(0, previous.overageQuantity + past(event.quantity) - past(previous.quantity)) : past(event.quantity) - past(0);
  // Voice multiplies before it divides, so whole minutes cost whole units.
  const minor = event.usageKind === "voice_seconds" ? (quantity * terms.overage.rates.voiceMinute) / 60 : quantity * terms.overage.rates.chat;
  return { quantity, minor };
}

/** What an event's business overage already went to its partner's Stripe: what Stripe has, and the report still out. */
type StripeOverageSent = { stripeSyncStatus: string | null; stripeOverageReportedMinor: number; stripeOverageSendingMinor: number | null };

// Overage carries fractions of the smallest unit, so comparing allows for float error.
const OVERAGE_EPSILON = 1e-9;

/**
 * Where an event's business overage stands with its partner's Stripe once
 * the event records it: pending while it differs from what Stripe was sent,
 * so the usage sync reports the difference, and as it was otherwise. An
 * event with no business overage to report has nothing to send.
 */
export function stripeSyncStatusFor(overage: BusinessOverage | null, sent: StripeOverageSent | undefined): string | null {
  const status = sent?.stripeSyncStatus ?? null;
  if (!overage) return status;
  const reported = (sent?.stripeOverageReportedMinor ?? 0) + (sent?.stripeOverageSendingMinor ?? 0);
  return Math.abs(overage.minor - reported) > OVERAGE_EPSILON ? "pending" : status;
}

async function ensureUsageMonth(tx: DatabaseTransaction, businessId: string, periodKey: string, plan: BillingPlanSlug): Promise<void> {
  await tx.insert(billingUsageMonths).values({ businessId, periodKey, planAtSnapshot: plan }).onConflictDoNothing({ target: [billingUsageMonths.businessId, billingUsageMonths.periodKey] });
}

function usageStatusFrom(input: { periodKey: string; billing: BillingContext; events: ReplayEvent[] }): UsageStatus {
  const { events, billing: { plan, entitlement: { allowance, overage } } } = input;
  const replay = replayEvents(events, input.billing);
  const capCents = overage.capMinor;
  const overageSpendCents = Math.max(0, Math.ceil(replay.rawSpendCents - 1e-9));
  const capReached = capCents !== null && replay.rawSpendCents > 0 && overageSpendCents >= capCents;
  // A chat past the allowance stops with overage off, or when its price
  // would take the spend past the cap. A plan's chats cost nothing, so its
  // cap never stops them.
  const chatPastCap = overage.enabled && capCents !== null && overage.rates.chat > 0 && replay.rawSpendCents + overage.rates.chat > capCents;
  return {
    periodKey: input.periodKey,
    plan,
    voiceSecondsUsed: replay.usage.voice_seconds,
    alertSmsSegmentsUsed: replay.usage.alert_sms_segments,
    outboundCallAttemptsUsed: replay.usage.outbound_call_attempts,
    chatAiTokensUsed: replay.usage.chat_ai_tokens,
    voiceSecondsIncluded: allowance.voiceSeconds,
    alertSmsSegmentsIncluded: allowance.alertSms,
    outboundCallAttemptsIncluded: allowance.outboundAttempts,
    chatAiTokensIncluded: allowance.chats,
    voiceBlocked: (!overage.enabled && allowance.voiceSeconds !== null && replay.usage.voice_seconds >= allowance.voiceSeconds) || capReached,
    alertSmsBlocked: (!overage.enabled && allowance.alertSms !== null && replay.usage.alert_sms_segments >= allowance.alertSms) || (capReached && allowance.alertSms !== null),
    outboundCallAttemptsBlocked: (!overage.enabled && allowance.outboundAttempts !== null && replay.usage.outbound_call_attempts >= allowance.outboundAttempts) || (capReached && allowance.outboundAttempts !== null),
    chatAiBlocked: (!overage.enabled || chatPastCap) && allowance.chats !== null && replay.usage.chat_ai_tokens >= allowance.chats,
    overageSpendCents,
    overageSpendingCapCents: capCents,
    overageSpendingCapReached: capReached,
    usageComplete: events.every((event) => event.isFinal),
  };
}

// The largest spend billing_usage_months.overage_spend_cents holds.
const MAX_MONTH_SPEND = 2_147_483_647;

async function refreshUsageMonth(tx: DatabaseTransaction, input: { businessId: string; periodKey: string; billing: BillingContext; events?: ReplayEvent[] }): Promise<UsageStatus> {
  const events = input.events ?? await loadEvents(tx, input.businessId, input.periodKey, input.billing);
  const status = usageStatusFrom({ periodKey: input.periodKey, billing: input.billing, events });
  await ensureUsageMonth(tx, input.businessId, input.periodKey, input.billing.plan);
  await tx.update(billingUsageMonths).set({
    planAtSnapshot: input.billing.plan,
    voiceSecondsUsed: status.voiceSecondsUsed,
    alertSmsSegmentsUsed: status.alertSmsSegmentsUsed,
    outboundCallAttemptsUsed: status.outboundCallAttemptsUsed,
    chatAiTokensUsed: status.chatAiTokensUsed,
    voiceBlocked: status.voiceBlocked,
    alertSmsBlocked: status.alertSmsBlocked,
    outboundCallAttemptsBlocked: status.outboundCallAttemptsBlocked,
    chatAiBlocked: status.chatAiBlocked,
    // The column is an integer. A package's uncapped overage at a high rate, in
    // a currency with large minor amounts, could pass it, and an error here
    // would fail every later reservation instead of refusing it.
    overageSpendCents: Math.min(status.overageSpendCents, MAX_MONTH_SPEND),
    lastRecordedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(billingUsageMonths.businessId, input.businessId), eq(billingUsageMonths.periodKey, input.periodKey)));
  return status;
}

/**
 * The voice seconds a business can use now: what it has left, or what its
 * partner's pool has left when that's fewer. Without tier billing, only a
 * pool the host set limits it.
 */
async function voiceSecondsLeftNow(tx: DatabaseTransaction, input: { businessId: string; periodKey: string; lockPool: boolean }): Promise<{ plan: BillingPlanSlug; entitlement: Entitlement; seconds: number }> {
  const billing = await loadBillingContext(tx, input.businessId);
  const seconds = voiceSecondsLeft(billing.entitlement, replayEvents(await loadEvents(tx, input.businessId, input.periodKey, billing), billing));
  const partnerId = billing.entitlement.poolPartnerId;
  if (!partnerId) return { plan: billing.plan, entitlement: billing.entitlement, seconds };
  const pool = input.lockPool ? await lockPartnerPoolInTransaction(tx, { partnerId, periodKey: input.periodKey }) : await readPartnerPoolInTransaction(tx, { partnerId, periodKey: input.periodKey });
  return { plan: billing.plan, entitlement: billing.entitlement, seconds: Math.min(seconds, poolLeft(pool, "voice_seconds")) };
}

/** The plan, entitlement and voice seconds left now, read under the period lock and the pool's, so a reservation in the same transaction agrees. */
export async function getVoiceSecondsLeftInTransaction(tx: DatabaseTransaction, input: { businessId: string }): Promise<{ plan: BillingPlanSlug; entitlement: Entitlement; seconds: number }> {
  const periodKey = periodKeyFor();
  await lockUsagePeriod(tx, input.businessId, periodKey);
  return await voiceSecondsLeftNow(tx, { businessId: input.businessId, periodKey, lockPool: true });
}

/** The same without the locks, for checks that only decide whether to offer a call. The call's reservation locks and counts again. */
export async function readVoiceSecondsLeftInTransaction(tx: DatabaseTransaction, input: { businessId: string; periodKey?: string }): Promise<{ plan: BillingPlanSlug; entitlement: Entitlement; seconds: number }> {
  return await voiceSecondsLeftNow(tx, { businessId: input.businessId, periodKey: input.periodKey ?? periodKeyFor(), lockPool: false });
}

/**
 * The voice seconds a business has left by the calls that ended, leaving out
 * what open calls hold, since those seconds come back when the calls end. A
 * partner's business counts its pool the same way, and `pooled` says whether
 * a pool limited its minutes. A partner's trial number forwards for good only
 * once these run out: calls its partner's other businesses hold open can
 * refuse one of its calls for now, but don't use up its minutes.
 */
export async function readEndedVoiceSecondsLeftInTransaction(tx: DatabaseTransaction, input: { businessId: string; periodKey?: string }): Promise<{ seconds: number; pooled: boolean }> {
  const periodKey = input.periodKey ?? periodKeyFor();
  const billing = await loadBillingContext(tx, input.businessId);
  const ended = (await loadEvents(tx, input.businessId, periodKey, billing)).filter((event) => event.isFinal);
  const seconds = voiceSecondsLeft(billing.entitlement, replayEvents(ended, billing));
  const partnerId = billing.entitlement.poolPartnerId;
  if (!partnerId) return { seconds, pooled: false };
  const pool = await readPartnerPoolInTransaction(tx, { partnerId, periodKey });
  if (pool.terms.voiceSeconds === null) return { seconds, pooled: false };
  const settled: PoolState = { ...pool, month: { ...pool.month, voiceSecondsUsed: pool.month.voiceSecondsFinal } };
  return { seconds: Math.min(seconds, poolLeft(settled, "voice_seconds")), pooled: true };
}

export async function getUsageStatusInTransaction(tx: DatabaseTransaction, input: { businessId: string; periodKey?: string }): Promise<UsageStatus> {
  const periodKey = input.periodKey ?? periodKeyFor();
  // Every writer takes this lock before the month row, so a status read
  // followed by a reservation cannot deadlock with a call reserving first.
  await lockUsagePeriod(tx, input.businessId, periodKey);
  const billing = await loadBillingContext(tx, input.businessId);
  return await refreshUsageMonth(tx, { businessId: input.businessId, periodKey, billing });
}

// The same count without the period lock or saving the month's row, for checks
// that only decide what to offer, such as the website chat's settings: they
// don't wait behind a call reserving its minutes. Using an allowance reserves
// it, and the reservation locks and counts again.
export async function readUsageStatusInTransaction(tx: DatabaseTransaction, input: { businessId: string; periodKey?: string }): Promise<UsageStatus> {
  const periodKey = input.periodKey ?? periodKeyFor();
  const billing = await loadBillingContext(tx, input.businessId);
  const events = await loadEvents(tx, input.businessId, periodKey, billing);
  return usageStatusFrom({ periodKey, billing, events });
}

/**
 * A business's minutes and chats this month against its allowance, as its own
 * dashboard shows them to every operator. It carries no prices or spend: a
 * partner's business sees prices only on its partner's invoices. A null
 * allowance has no limit, as for a partner's business billed outside
 * LobbyStack.
 */
export type AllowanceUsage = {
  periodKey: string;
  /** When the month's usage starts over: the first of next month, in UTC, as periods run. */
  resetsAt: string;
  voiceSeconds: { used: number; included: number | null; blocked: boolean };
  chats: { used: number; included: number | null; blocked: boolean };
  /**
   * For a business on a package: whether its overage is on now, and the
   * seconds and chats it used past its allowance this month, which its
   * partner bills it for, counted as calls end. Null for any other business.
   */
  overage: { enabled: boolean; voiceSeconds: number; chats: number } | null;
};

/** What the month's final usage put past a business's allowance, by kind, as each event recorded it. */
async function businessOverageUsed(tx: DatabaseTransaction, input: { businessId: string; periodKey: string }): Promise<{ voiceSeconds: number; chats: number }> {
  const rows = await tx.select({ usageKind: billingUsageEvents.usageKind, quantity: sql<number>`coalesce(sum(${billingUsageEvents.businessOverageQuantity}), 0)::double precision` })
    .from(billingUsageEvents)
    .where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.periodKey, input.periodKey), eq(billingUsageEvents.isFinal, true), isNotNull(billingUsageEvents.businessOverageQuantity)))
    .groupBy(billingUsageEvents.usageKind);
  const of = (kind: string) => Math.max(0, Number(rows.find((row) => row.usageKind === kind)?.quantity ?? 0));
  return { voiceSeconds: of("voice_seconds"), chats: of("chat_ai_tokens") };
}

/** The business's usage this month against loadEntitlement's allowance, and its overage on a package, read without the period lock. */
export async function readAllowanceUsageInTransaction(tx: DatabaseTransaction, input: { businessId: string; now?: Date | undefined }): Promise<AllowanceUsage> {
  const now = input.now ?? new Date();
  const periodKey = periodKeyFor(now);
  const billing = await loadBillingContext(tx, input.businessId);
  const status = usageStatusFrom({ periodKey, billing, events: await loadEvents(tx, input.businessId, periodKey, billing) });
  return {
    periodKey: status.periodKey,
    resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    voiceSeconds: { used: status.voiceSecondsUsed, included: status.voiceSecondsIncluded, blocked: status.voiceBlocked },
    chats: { used: status.chatAiTokensUsed, included: status.chatAiTokensIncluded, blocked: status.chatAiBlocked },
    overage: billing.entitlement.source === "package" ? { enabled: billing.entitlement.overage.enabled, ...await businessOverageUsed(tx, { businessId: input.businessId, periodKey }) } : null,
  };
}

/** The columns stripeSyncStatusFor reads of an event already recorded. */
const stripeOverageColumns = { stripeSyncStatus: billingUsageEvents.stripeSyncStatus, stripeOverageReportedMinor: billingUsageEvents.stripeOverageReportedMinor, stripeOverageSendingMinor: billingUsageEvents.stripeOverageSendingMinor };

/** The pool this usage draws on, locked after the business's own lock: its partner's, for voice and chats. */
async function lockPoolFor(tx: DatabaseTransaction, input: { partnerId: string | null; usageKind: NonAiBillingUsageKind; periodKey: string }): Promise<PoolState | null> {
  return input.partnerId && isPoolUsageKind(input.usageKind) ? await lockPartnerPoolInTransaction(tx, { partnerId: input.partnerId, periodKey: input.periodKey }) : null;
}

/** An event's pooled usage before a change, when it drew on this pool. */
function pooledBefore(row: { quantity: number; isFinal: boolean; poolPartnerId: string | null; poolOverageQuantity: number | null; poolOverageCents: number | null } | undefined, pool: PoolState): PooledEvent | null {
  if (!row || row.poolPartnerId !== pool.partnerId) return null;
  return { quantity: row.quantity, isFinal: row.isFinal, overageQuantity: row.poolOverageQuantity ?? 0, overageCents: row.poolOverageCents ?? 0 };
}

/**
 * Reserves usage for a business. A partner's business's voice and chats also
 * draw on its partner's pool: the reservation takes the business's lock and
 * then the pool's, every time, and grants no more than the smaller of what
 * each has left. Running out of either refuses it with the same limit.
 */
export async function reserveUsageInTransaction(tx: DatabaseTransaction, input: { businessId: string; usageKind: NonAiBillingUsageKind; sourceKey: string; quantity?: number | undefined; recordedAt?: Date | undefined }): Promise<UsageReservationResult> {
  const recordedAt = input.recordedAt ?? new Date();
  const periodKey = periodKeyFor(recordedAt);
  await lockUsagePeriod(tx, input.businessId, periodKey);
  const billing = await loadBillingContext(tx, input.businessId);
  const existing = (await tx.select({ id: billingUsageEvents.id, quantity: billingUsageEvents.quantity, syncStatus: billingUsageEvents.syncStatus, isFinal: billingUsageEvents.isFinal, poolPartnerId: billingUsageEvents.poolPartnerId, poolOverageQuantity: billingUsageEvents.poolOverageQuantity, poolOverageCents: billingUsageEvents.poolOverageCents, ...stripeOverageColumns }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, input.sourceKey))).limit(1))[0];
  if (existing && existing.quantity > 0) return { allowed: true, errorCode: null, usageEventId: existing.id, syncNeeded: existing.syncStatus === "pending" || existing.stripeSyncStatus === "pending", periodKey, plan: billing.plan, quantity: existing.quantity };
  const pool = await lockPoolFor(tx, { partnerId: billing.entitlement.poolPartnerId, usageKind: input.usageKind, periodKey });
  const refused: UsageReservationResult = { allowed: false, errorCode: limitReached(input.usageKind), syncNeeded: false, periodKey, plan: billing.plan };
  // A new call waits for room among the calls its partner's businesses hold
  // open, whatever the pool has left, and is refused like a call the pool
  // can't pay for, so it forwards the same way.
  if (pool && input.usageKind === "voice_seconds" && await partnerCallsFullInTransaction(tx, pool, { sourceKey: input.sourceKey })) return refused;
  const poolHas = pool && isPoolUsageKind(input.usageKind) ? poolLeft(pool, input.usageKind) : Number.POSITIVE_INFINITY;
  const events = await loadEvents(tx, input.businessId, periodKey, billing);
  const current = replayEvents(events, billing);
  let quantity = input.quantity;
  // A phone call reserves one slice and the worker tops it up as the call
  // runs, so concurrent calls share what remains, the pool's included. A
  // call on a pool reserves its slice even when nothing limits it, so its
  // event names the pool and the terms it started on: the call stays on that
  // pool if its business leaves the partner mid-call, and a tier that changes
  // mid-call doesn't reprice it.
  if (quantity === undefined && input.usageKind === "voice_seconds") {
    const left = Math.min(voiceSecondsLeft(billing.entitlement, current), poolHas);
    if (left === Number.POSITIVE_INFINITY && !pool) return { allowed: true, errorCode: null, syncNeeded: false, periodKey, plan: billing.plan };
    quantity = Math.min(PHONE_RESERVATION_SLICE_SECONDS, left);
  }
  quantity = Math.max(0, quantity ?? 0);
  if (quantity <= 0) return refused;
  const included = includedQuantity(billing.entitlement, input.usageKind);
  if (!billing.entitlement.overage.enabled && included !== null && current.usage[input.usageKind] + quantity > included) return refused;
  if (quantity > poolHas) return refused;
  const eventPayload = { sourceKey: input.sourceKey, quantity, usageKind: input.usageKind, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, createdAt: recordedAt, isFinal: input.usageKind === "outbound_call_attempts" || input.usageKind === "chat_ai_tokens" };
  const simulated = replayEvents([...events, eventPayload], billing);
  // A plan's website chat adds no spend, so spend already past the cap must
  // not block it. A chat a package prices past its allowance spends the cap
  // like a minute does, and stops there. Usage the allowance doesn't limit,
  // such as a package business's alert texts and transfers, never stops at it.
  const capCents = billing.entitlement.overage.capMinor;
  const addsSpend = simulated.rawSpendCents > current.rawSpendCents;
  if (capCents !== null && simulated.rawSpendCents > capCents && capLimits(billing.entitlement, input.usageKind) && (input.usageKind !== "chat_ai_tokens" || addsSpend)) return refused;
  const pooled = pool && isPoolUsageKind(input.usageKind) ? poolChangeFor(pool, pool.terms, { kind: input.usageKind, before: pooledBefore(existing, pool), after: { quantity, isFinal: eventPayload.isFinal } }) : null;
  // Usage on a pool syncs only its overage, which the partner pays the host; the business pays the host nothing.
  const syncNeeded = pooled ? pooled.overage.cents > 0 : billing.plan === "starter" || billing.plan === "pro";
  const others = events.filter((row) => row.sourceKey !== input.sourceKey);
  const billableQuantity = billableQuantityForEvent(others, eventPayload, billing);
  // A chat is final once reserved, so it records what it put past the business's allowance now. A call does when it ends.
  const businessOverage = eventPayload.isFinal ? businessOverageFor(others, eventPayload, packageTermsFor(billing, null), null) : null;
  // What that overage costs the business goes to its partner's Stripe, apart from the pool's to Polar.
  const stripeSyncStatus = stripeSyncStatusFor(businessOverage, existing);
  const recorded = {
    termsAtRecordTime: recordedTerms(billing.entitlement, pool),
    poolPartnerId: pool?.partnerId ?? null,
    poolOverageQuantity: pooled && eventPayload.isFinal ? pooled.overage.quantity : null,
    poolOverageCents: pooled && eventPayload.isFinal ? pooled.overage.cents : null,
    businessOverageQuantity: businessOverage?.quantity ?? null,
    businessOverageMinor: businessOverage?.minor ?? null,
    stripeSyncStatus,
  };
  const [event] = existing
    ? await tx.update(billingUsageEvents).set({ quantity, billableQuantity, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, ...recorded, isFinal: eventPayload.isFinal, syncStatus: syncNeeded ? "pending" : "skipped", updatedAt: new Date() }).where(eq(billingUsageEvents.id, existing.id)).returning({ id: billingUsageEvents.id })
    : await tx.insert(billingUsageEvents).values({ businessId: input.businessId, periodKey, sourceKey: input.sourceKey, usageKind: input.usageKind, quantity, billableQuantity, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, ...recorded, isFinal: eventPayload.isFinal, syncStatus: syncNeeded ? "pending" : "skipped", createdAt: recordedAt, updatedAt: new Date() }).returning({ id: billingUsageEvents.id });
  if (!event) throw new Error("Billing usage event could not be recorded.");
  if (pool && pooled) {
    await recordPartnerPoolUsageInTransaction(tx, pool, pooled.change);
    await queuePartnerPoolAlertsInTransaction(tx, { businessId: input.businessId, pool, change: pooled.change });
  }
  await refreshUsageMonth(tx, { businessId: input.businessId, periodKey, billing, events: [...others, eventPayload] });
  if (eventPayload.isFinal) await queueBusinessAllowanceAlertsInTransaction(tx, { businessId: input.businessId, periodKey, entitlement: billing.entitlement });
  return { allowed: true, errorCode: null, usageEventId: event.id, syncNeeded: syncNeeded || stripeSyncStatus === "pending", periodKey, plan: billing.plan, quantity };
}

/**
 * Grows a phone call's reservation while the call runs: by one slice, or by
 * what the plan or the partner's pool has left, and never past
 * MAX_PHONE_CALL_MS for the call. Returns the seconds granted, 0 when the
 * call has ended, is a browser call, holds no reservation (an unlimited
 * plan), or has nothing left to grow by. Like the first reservation it
 * queues no Polar sync: the call's finish corrects the event to the real
 * seconds and syncs those.
 */
export async function extendPhoneReservationInTransaction(tx: DatabaseTransaction, input: { businessId: string; callId: string }): Promise<number> {
  const sourceKey = `voice:${input.callId}`;
  const reservation = (await tx.select({ id: billingUsageEvents.id, periodKey: billingUsageEvents.periodKey, poolPartnerId: billingUsageEvents.poolPartnerId }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, sourceKey))).limit(1))[0];
  if (!reservation) return 0;
  await lockUsagePeriod(tx, input.businessId, reservation.periodKey);
  // Read under the lock, so a finish that took it first wins. Browser calls
  // reserve their whole length up front.
  const call = (await tx.select({ endedAt: calls.endedAt, transport: calls.transport }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1))[0];
  if (!call || call.endedAt !== null || call.transport === "web_voice") return 0;
  const billing = await loadBillingContext(tx, input.businessId);
  const events = await loadEvents(tx, input.businessId, reservation.periodKey, billing);
  const event = events.find((row) => row.sourceKey === sourceKey);
  if (!event) return 0;
  // The call keeps drawing on the pool it started on, locked after the business.
  const pool = reservation.poolPartnerId ? await lockPartnerPoolInTransaction(tx, { partnerId: reservation.poolPartnerId, periodKey: reservation.periodKey }) : null;
  // The replay already counts this call's reservation, and so does the pool.
  // A plan upgraded to unlimited mid-call still grows it, up to the longest call.
  const free = Math.min(voiceSecondsLeft(billing.entitlement, replayEvents(events, billing)), pool ? poolLeft(pool, "voice_seconds") : Number.POSITIVE_INFINITY);
  const granted = Math.min(PHONE_RESERVATION_SLICE_SECONDS, free, MAX_PHONE_CALL_MS / 1_000 - event.quantity);
  if (granted <= 0) return 0;
  const replayed = events.map((row) => (row === event ? { ...row, quantity: row.quantity + granted } : row));
  const capCents = billing.entitlement.overage.capMinor;
  if (capCents !== null && replayEvents(replayed, billing).rawSpendCents > capCents) return 0;
  const billableQuantity = billableQuantityForEvent(events.filter((row) => row !== event), { ...event, quantity: event.quantity + granted }, billing);
  await tx.update(billingUsageEvents).set({ quantity: event.quantity + granted, billableQuantity, updatedAt: new Date() }).where(eq(billingUsageEvents.id, reservation.id));
  if (pool) await recordPartnerPoolUsageInTransaction(tx, pool, { voiceSeconds: granted, voiceSecondsFinal: 0, chats: 0, overageVoiceSeconds: 0, overageChats: 0, overageSpendCents: 0 });
  await refreshUsageMonth(tx, { businessId: input.businessId, periodKey: reservation.periodKey, billing, events: replayed });
  return granted;
}

/**
 * Records an event's final quantity: a call's real seconds when it ends, or
 * what a provider reported. Usage that drew on a partner's pool moves the
 * pool's counts too, and records the overage it put past the pool, which
 * then syncs to Polar under the partner's customer. Usage of a business on a
 * package also records what it put past the business's own allowance, and
 * what that costs the business at the terms it recorded, which then syncs to
 * its partner's Stripe, and queues the business's alerts at 80% and 100% of
 * its allowance.
 */
export async function correctUsageInTransaction(tx: DatabaseTransaction, input: { businessId: string; sourceKey: string; usageKind: NonAiBillingUsageKind; quantity: number; recordedAt?: Date | undefined }): Promise<string> {
  const recordedAt = input.recordedAt ?? new Date();
  const existingBeforeLock = (await tx.select({ id: billingUsageEvents.id, periodKey: billingUsageEvents.periodKey }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, input.sourceKey))).limit(1))[0];
  const periodKey = existingBeforeLock?.periodKey ?? periodKeyFor(recordedAt);
  await lockUsagePeriod(tx, input.businessId, periodKey);
  const billing = await loadBillingContext(tx, input.businessId);
  const existing = (await tx.select({ id: billingUsageEvents.id, periodKey: billingUsageEvents.periodKey, planAtRecordTime: billingUsageEvents.planAtRecordTime, billingIntervalAtRecordTime: billingUsageEvents.billingIntervalAtRecordTime, createdAt: billingUsageEvents.createdAt, quantity: billingUsageEvents.quantity, billableQuantity: billingUsageEvents.billableQuantity, isFinal: billingUsageEvents.isFinal, termsAtRecordTime: billingUsageEvents.termsAtRecordTime, poolPartnerId: billingUsageEvents.poolPartnerId, poolOverageQuantity: billingUsageEvents.poolOverageQuantity, poolOverageCents: billingUsageEvents.poolOverageCents, businessOverageQuantity: billingUsageEvents.businessOverageQuantity, ...stripeOverageColumns }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), eq(billingUsageEvents.sourceKey, input.sourceKey))).limit(1))[0];
  const quantity = Math.max(0, input.quantity);
  // An event stays on the pool it was recorded on, even after its business leaves the partner.
  const pool = await lockPoolFor(tx, { partnerId: existing ? existing.poolPartnerId : billing.entitlement.poolPartnerId, usageKind: input.usageKind, periodKey });
  const pooled = pool && isPoolUsageKind(input.usageKind)
    ? poolChangeFor(pool, existing ? recordedPoolTerms(existing.termsAtRecordTime, pool) : pool.terms, { kind: input.usageKind, before: pooledBefore(existing, pool), after: { quantity, isFinal: true } })
    : null;
  const syncStatus = (pooled ? pooled.overage.cents > 0 : billing.plan === "starter" || billing.plan === "pro") ? "pending" : "skipped";
  const poolOverage = pooled ? { poolOverageQuantity: pooled.overage.quantity, poolOverageCents: pooled.overage.cents } : {};
  let eventId: string;
  if (existing) {
    const events = await loadEvents(tx, input.businessId, periodKey, billing);
    const replacement: ReplayEvent = { sourceKey: input.sourceKey, quantity, usageKind: input.usageKind, planAtRecordTime: existing.planAtRecordTime ?? billing.plan, billingIntervalAtRecordTime: existing.billingIntervalAtRecordTime ?? billing.billingInterval, createdAt: existing.createdAt, isFinal: true };
    const billed = existing.isFinal ? { quantity: existing.quantity, billableQuantity: existing.billableQuantity ?? existing.quantity } : undefined;
    const others = events.filter((row) => row.sourceKey !== input.sourceKey);
    const billableQuantity = billableQuantityForEvent(others, replacement, billing, billed);
    // The event keeps the terms it recorded when it started, as a call does from its first slice.
    const businessOverage = businessOverageFor(others, replacement, packageTermsFor(billing, existing.termsAtRecordTime), existing.isFinal ? { quantity: existing.quantity, overageQuantity: existing.businessOverageQuantity ?? 0 } : null);
    await tx.update(billingUsageEvents).set({ quantity, billableQuantity, ...poolOverage, businessOverageQuantity: businessOverage?.quantity ?? null, businessOverageMinor: businessOverage?.minor ?? null, stripeSyncStatus: stripeSyncStatusFor(businessOverage, existing), isFinal: true, syncStatus, updatedAt: new Date() }).where(eq(billingUsageEvents.id, existing.id));
    eventId = existing.id;
  } else {
    const replacement: ReplayEvent = { sourceKey: input.sourceKey, quantity, usageKind: input.usageKind, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, createdAt: recordedAt, isFinal: true };
    const events = await loadEvents(tx, input.businessId, periodKey, billing);
    const billableQuantity = billableQuantityForEvent(events, replacement, billing);
    const businessOverage = businessOverageFor(events, replacement, packageTermsFor(billing, null), null);
    const [event] = await tx.insert(billingUsageEvents).values({ businessId: input.businessId, periodKey, sourceKey: input.sourceKey, usageKind: input.usageKind, quantity, billableQuantity, planAtRecordTime: billing.plan, billingIntervalAtRecordTime: billing.billingInterval, termsAtRecordTime: recordedTerms(billing.entitlement, pool), poolPartnerId: pool?.partnerId ?? null, ...poolOverage, businessOverageQuantity: businessOverage?.quantity ?? null, businessOverageMinor: businessOverage?.minor ?? null, stripeSyncStatus: stripeSyncStatusFor(businessOverage, undefined), isFinal: true, syncStatus, createdAt: recordedAt, updatedAt: new Date() }).returning({ id: billingUsageEvents.id });
    if (!event) throw new Error("Billing usage correction could not be recorded.");
    eventId = event.id;
  }
  if (pool && pooled) {
    await recordPartnerPoolUsageInTransaction(tx, pool, pooled.change);
    await queuePartnerPoolAlertsInTransaction(tx, { businessId: input.businessId, pool, change: pooled.change });
  }
  await refreshUsageMonth(tx, { businessId: input.businessId, periodKey, billing });
  await queueBusinessAllowanceAlertsInTransaction(tx, { businessId: input.businessId, periodKey, entitlement: billing.entitlement });
  return eventId;
}

export async function enqueueUsageSyncInTransaction(tx: DatabaseTransaction, input: { businessId: string; usageEventId: string }): Promise<void> {
  const event = (await tx.select({ quantity: billingUsageEvents.quantity, syncStatus: billingUsageEvents.syncStatus, stripeSyncStatus: billingUsageEvents.stripeSyncStatus, isFinal: billingUsageEvents.isFinal }).from(billingUsageEvents).where(and(eq(billingUsageEvents.id, input.usageEventId), eq(billingUsageEvents.businessId, input.businessId))).limit(1))[0];
  // A draft can't be billed yet, and its key would block the final count's sync when the quantity doesn't change.
  // One job reports both what the event owes Polar and what it owes the partner's Stripe.
  if (!event || (event.syncStatus !== "pending" && event.stripeSyncStatus !== "pending") || !event.isFinal) return;
  await enqueueOutbox(tx, {
    topic: "billing.syncUsage",
    businessId: input.businessId,
    aggregateType: "billing_usage_event",
    aggregateId: input.usageEventId,
    dedupeKey: `billing-usage:${input.usageEventId}:sync:${event.quantity}`,
    payload: { usageEventId: input.usageEventId },
  });
}
