import { sql } from "drizzle-orm";

import type { DatabaseTransaction } from "@lobbystack/db";
import { MAX_PHONE_CALL_MS, PARTNER_MAX_SIMULTANEOUS_CALLS_DEFAULT, partnerFeatures, partnerTierCatalog, partnerTierInForce, type PartnerTierSlug } from "@lobbystack/shared";

// A partner's pool: the voice minutes and website chats its tier includes
// each month, shared by all its businesses. A deployment that bills no tiers
// uses the pool its host set for the partner, or none. Usage metering
// reaches it from a business's transaction, after the business's own lock,
// through the functions of migrations 0153 and 0158, since that transaction
// can't read the partner's other businesses. The pool keeps running counts,
// which each reservation, top-up and correction moves by what it changed.

/** The usage that draws on a partner's pool. Alert texts and transfer attempts don't. */
export type PoolUsageKind = "voice_seconds" | "chat_ai_tokens";

export function isPoolUsageKind(kind: string): kind is PoolUsageKind {
  return kind === "voice_seconds" || kind === "chat_ai_tokens";
}

/** The pool's terms in force: what the partner's businesses share each month, and what usage past it costs. */
export type PoolTerms = {
  partnerId: string;
  /** The tier in force: a paid tier while its subscription is live, and Free otherwise. */
  tier: PartnerTierSlug;
  /**
   * Who sets the pool: the tier in force while the deployment bills tiers,
   * and the host otherwise. Events recorded before migration 0158 don't name it.
   */
  source: "tier" | "host";
  /**
   * Voice seconds and chats the businesses share each month. Null means no
   * limit, as on a deployment that bills no tiers until the host sets a pool.
   */
  voiceSeconds: number | null;
  chats: number | null;
  /**
   * Usage past the pool, which Polar bills the partner at the tier's rates,
   * in US cents, until the month's spend reaches the cap. Free has none, and
   * the partner can turn it off. A null cap means no cap.
   */
  overage: { enabled: boolean; capCents: number | null; rates: { voiceMinute: number; chat: number } };
};

/** What the partner's businesses used this month, as the pool counts it. */
export type PoolMonth = {
  /** Voice seconds, counting open reservations, so calls at once share what's left. */
  voiceSecondsUsed: number;
  /** Voice seconds of the calls that ended. */
  voiceSecondsFinal: number;
  chatsUsed: number;
  /** Final usage past the pool that the partner pays for, and what it costs, in US cents. */
  overageVoiceSeconds: number;
  overageChats: number;
  overageSpendCents: number;
  /** The month's alerts already sent the partner's owners and admins, by key. */
  alertsSent: Record<string, string>;
};

export type PoolState = { partnerId: string; periodKey: string; terms: PoolTerms; month: PoolMonth };

type PoolRow = {
  tier: string | null;
  subscription_state: string | null;
  pool_voice_seconds: number | null;
  pool_chats: number | null;
  overage_enabled: boolean;
  overage_cap_cents: number | null;
  host_pool_voice_seconds: number | null;
  host_pool_chats: number | null;
  voice_seconds_used: number;
  voice_seconds_final: number;
  chats_used: number;
  overage_voice_seconds: number;
  overage_chats: number;
  overage_spend_cents: number;
  alerts_sent: Record<string, string> | null;
};

/**
 * The pool of the tier in force, as the worker last reconciled it. A partner
 * Polar never billed is on Free. The rates come from the tier catalog.
 *
 * A deployment that bills no tiers uses the pool the host set instead, each
 * kind with no limit until the host sets one. Nothing prices usage past it
 * there, so it has no overage and no cap: the businesses stop at the pool.
 */
function poolTerms(partnerId: string, row: PoolRow): PoolTerms {
  const tier = partnerTierInForce({ tier: row.tier, subscriptionState: row.subscription_state });
  if (!partnerFeatures(process.env).tierBilling) {
    return { partnerId, tier, source: "host", voiceSeconds: row.host_pool_voice_seconds ?? null, chats: row.host_pool_chats ?? null, overage: { enabled: false, capCents: null, rates: { voiceMinute: 0, chat: 0 } } };
  }
  const terms = partnerTierCatalog[tier];
  return {
    partnerId,
    tier,
    source: "tier",
    voiceSeconds: row.pool_voice_seconds ?? terms.poolVoiceSeconds,
    chats: row.pool_chats ?? terms.poolChats,
    overage: {
      enabled: terms.overagesBillable && row.overage_enabled,
      capCents: row.overage_cap_cents,
      rates: { voiceMinute: terms.voiceOverageRatePerMinuteCents ?? 0, chat: terms.chatOverageRatePerChatCents ?? 0 },
    },
  };
}

function poolState(partnerId: string, periodKey: string, row: PoolRow | undefined): PoolState {
  if (!row) throw Object.assign(new Error("This transaction can't reach the partner's pool."), { status: 403, code: "partner_pool_unavailable" });
  return {
    partnerId,
    periodKey,
    terms: poolTerms(partnerId, row),
    month: {
      voiceSecondsUsed: Number(row.voice_seconds_used),
      voiceSecondsFinal: Number(row.voice_seconds_final),
      chatsUsed: Number(row.chats_used),
      overageVoiceSeconds: Number(row.overage_voice_seconds),
      overageChats: Number(row.overage_chats),
      overageSpendCents: Number(row.overage_spend_cents),
      alertsSent: row.alerts_sent ?? {},
    },
  };
}

/**
 * The pool's terms and this month's counts, without its lock. The worker
 * reads it inside one of the partner's businesses, and an operator on the
 * partner's team from the console. Anyone else is refused.
 */
export async function readPartnerPoolInTransaction(tx: DatabaseTransaction, input: { partnerId: string; periodKey: string }): Promise<PoolState> {
  const result = await tx.execute<PoolRow>(sql`select * from app.partner_pool_month(${input.partnerId}::uuid, ${input.periodKey})`);
  return poolState(input.partnerId, input.periodKey, result.rows[0]);
}

/**
 * Takes the pool's lock for the month, then reads it. Callers take the
 * business's usage lock first, every time, so reservations from two of the
 * partner's businesses wait on each other and never deadlock.
 */
export async function lockPartnerPoolInTransaction(tx: DatabaseTransaction, input: { partnerId: string; periodKey: string }): Promise<PoolState> {
  const result = await tx.execute<PoolRow>(sql`select * from app.lock_partner_pool(${input.partnerId}::uuid, ${input.periodKey})`);
  return poolState(input.partnerId, input.periodKey, result.rows[0]);
}

/** How one event moved the pool's counts. */
export type PoolChange = {
  voiceSeconds: number;
  voiceSecondsFinal: number;
  chats: number;
  overageVoiceSeconds: number;
  overageChats: number;
  overageSpendCents: number;
};

/** Moves the month's counts. The caller holds the pool's lock from when it checked what was left. */
export async function recordPartnerPoolUsageInTransaction(tx: DatabaseTransaction, pool: Pick<PoolState, "partnerId" | "periodKey">, change: PoolChange): Promise<void> {
  if (Object.values(change).every((value) => value === 0)) return;
  await tx.execute(sql`select app.record_partner_pool_usage(${pool.partnerId}::uuid, ${pool.periodKey}, ${change.voiceSeconds}, ${change.voiceSecondsFinal}, ${change.chats}, ${change.overageVoiceSeconds}, ${change.overageChats}, ${change.overageSpendCents})`);
}

// Spend and rates carry fractions of a cent, so comparisons allow for rounding.
const EPSILON = 1e-9;

/** The usage past the pool at this much use. */
function pastPool(limit: number | null, used: number): number {
  return limit === null ? 0 : Math.max(0, used - limit);
}

function limitOf(terms: PoolTerms, kind: PoolUsageKind): number | null {
  return kind === "voice_seconds" ? terms.voiceSeconds : terms.chats;
}

/** What this much usage past the pool costs at the terms' rates, in US cents. Voice multiplies before it divides, so whole minutes cost whole cents. */
function costOf(terms: PoolTerms, kind: PoolUsageKind, quantity: number): number {
  return kind === "voice_seconds" ? (quantity * terms.overage.rates.voiceMinute) / 60 : quantity * terms.overage.rates.chat;
}

/** How much usage past the pool this many cents buy at the terms' rates, in whole seconds or chats. */
function quantityFor(terms: PoolTerms, kind: PoolUsageKind, cents: number): number {
  const rate = kind === "voice_seconds" ? terms.overage.rates.voiceMinute : terms.overage.rates.chat;
  if (rate <= 0) return 0;
  return Math.floor((kind === "voice_seconds" ? cents * 60 : cents) / rate + EPSILON);
}

/**
 * What the pool's overage costs this month, in US cents: what the ended
 * calls and the chats put past it, plus the share of open reservations past
 * it at the minute rate, which their calls will cost if they run that long.
 */
export function poolSpendCents(state: PoolState): number {
  const { terms, month } = state;
  if (!terms.overage.enabled) return month.overageSpendCents;
  const open = Math.max(0, pastPool(terms.voiceSeconds, month.voiceSecondsUsed) - pastPool(terms.voiceSeconds, month.voiceSecondsFinal));
  return month.overageSpendCents + costOf(terms, "voice_seconds", open);
}

/**
 * What the pool has left of a kind this month: what it still includes, plus
 * what the cap still pays for at the tier's rate. Infinity when nothing
 * limits it: no tier billing and no pool the host set, or overage with no
 * cap. With overage off, as for a pool the host set, only what it includes.
 * Past the cap, nothing.
 */
export function poolLeft(state: PoolState, kind: PoolUsageKind): number {
  const { terms, month } = state;
  const limit = limitOf(terms, kind);
  if (limit === null) return Number.POSITIVE_INFINITY;
  const included = Math.max(0, limit - (kind === "voice_seconds" ? month.voiceSecondsUsed : month.chatsUsed));
  if (!terms.overage.enabled) return included;
  const cap = terms.overage.capCents;
  if (cap === null) return Number.POSITIVE_INFINITY;
  const spend = poolSpendCents(state);
  if (spend > cap + EPSILON) return 0;
  return included + quantityFor(terms, kind, Math.max(0, cap - spend));
}

/**
 * What one event puts past the pool once it's final, and what that costs
 * the partner. The month's other final usage comes first, so the overage
 * goes to the usage that ended past the pool, never to a call that's still
 * open. An event that was already final moves only by its own change. The
 * event's recorded terms price it, and usage past the pool costs nothing
 * while they bill no overage.
 */
export function poolOverageFor(
  state: PoolState,
  recorded: PoolTerms,
  input: { kind: PoolUsageKind; quantity: number; previous: { quantity: number; overageQuantity: number } | null },
): { quantity: number; cents: number } {
  const limit = limitOf(state.terms, input.kind);
  const final = input.kind === "voice_seconds" ? state.month.voiceSecondsFinal : state.month.chatsUsed;
  const others = Math.max(0, final - (input.previous?.quantity ?? 0));
  const past = (quantity: number) => pastPool(limit, others + Math.max(0, quantity));
  const quantity = input.previous
    ? Math.max(0, input.previous.overageQuantity + past(input.quantity) - past(input.previous.quantity))
    : past(input.quantity) - past(0);
  if (!recorded.overage.enabled) return { quantity: 0, cents: 0 };
  return { quantity, cents: costOf(recorded, input.kind, quantity) };
}

/** Sets the partner's pool overage on or off, with its monthly cap in US cents or none. The caller checked the person is an owner; the database checks again. */
export async function setPartnerPoolOverageInTransaction(tx: DatabaseTransaction, input: { partnerId: string; enabled: boolean; capCents: number | null }): Promise<void> {
  await tx.execute(sql`select app.set_partner_pool_overage(${input.partnerId}::uuid, ${input.enabled}, ${input.capCents}::integer)`);
}

/** An event's usage before a change, in this pool: its quantity, whether it was final, and the overage it recorded. */
export type PooledEvent = { quantity: number; isFinal: boolean; overageQuantity: number; overageCents: number };

/**
 * How a change to one event moves the pool's counts, and the overage the
 * event records once it's final. An open event records none yet.
 */
export function poolChangeFor(
  state: PoolState,
  recorded: PoolTerms,
  input: { kind: PoolUsageKind; before: PooledEvent | null; after: { quantity: number; isFinal: boolean } },
): { change: PoolChange; overage: { quantity: number; cents: number } } {
  const { before, after } = input;
  const beforeQuantity = Math.max(0, before?.quantity ?? 0);
  const afterQuantity = Math.max(0, after.quantity);
  const kept = { quantity: before?.overageQuantity ?? 0, cents: before?.overageCents ?? 0 };
  const overage = after.isFinal
    ? poolOverageFor(state, recorded, { kind: input.kind, quantity: afterQuantity, previous: before?.isFinal ? { quantity: beforeQuantity, overageQuantity: kept.quantity } : null })
    : kept;
  const used = afterQuantity - beforeQuantity;
  const final = (after.isFinal ? afterQuantity : 0) - (before?.isFinal ? beforeQuantity : 0);
  const change: PoolChange = input.kind === "voice_seconds"
    ? { voiceSeconds: used, voiceSecondsFinal: final, chats: 0, overageVoiceSeconds: overage.quantity - kept.quantity, overageChats: 0, overageSpendCents: overage.cents - kept.cents }
    : { voiceSeconds: 0, voiceSecondsFinal: 0, chats: used, overageVoiceSeconds: 0, overageChats: overage.quantity - kept.quantity, overageSpendCents: overage.cents - kept.cents };
  return { change, overage };
}

// Abuse guard, not a product limit: the most calls a partner's businesses
// hold open at once. A call past it is refused as a pool out of minutes is,
// so it forwards the same way. partnerFeatures reads its override, as it
// reads every partner setting.
export const PARTNER_MAX_SIMULTANEOUS_CALLS = PARTNER_MAX_SIMULTANEOUS_CALLS_DEFAULT;

export function partnerMaxSimultaneousCalls(env: NodeJS.ProcessEnv = process.env): number {
  return partnerFeatures(env).maxSimultaneousCalls;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether the partner's businesses already hold as many calls open as they
 * may, not counting the call this reservation is for. The caller holds the
 * pool's lock, so two calls arriving at once count each other. A call open
 * longer than any call runs was left behind and no longer counts.
 */
export async function partnerCallsFullInTransaction(tx: DatabaseTransaction, pool: Pick<PoolState, "partnerId" | "periodKey">, input: { sourceKey: string; now?: Date }): Promise<boolean> {
  const callId = input.sourceKey.startsWith("voice:") ? input.sourceKey.slice("voice:".length) : "";
  const startedAfter = new Date((input.now ?? new Date()).getTime() - MAX_PHONE_CALL_MS - 60_000);
  const result = await tx.execute<{ open: number }>(sql`select app.count_partner_open_calls(${pool.partnerId}::uuid, ${pool.periodKey}, ${startedAfter.toISOString()}::timestamptz, ${UUID.test(callId) ? callId : null}::uuid) as open`);
  return Number(result.rows[0]?.open ?? 0) >= partnerMaxSimultaneousCalls();
}
