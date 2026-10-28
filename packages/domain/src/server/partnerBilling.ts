import { and, desc, eq, gt, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { enqueueOutbox, partnerBillingAccounts, partnerCheckoutRequests, partnerDomains, partners, providerEvents, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import {
  billingErrorCodes,
  isBillingInterval,
  isPaidPartnerTierSlug,
  isUuid,
  parseDeploymentMode,
  partnerFeatures,
  partnerTierCatalog,
  partnerTierInForce,
  type BillingInterval,
  type PaidPartnerTierSlug,
  type PartnerTierSlug,
} from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { advancePartnerInTransaction, partnerTierEventKind } from "./partnerLifecycle";
import { loadPartnerNumberStanding } from "./partnerNumbers";
import { poolSpendCents, readPartnerPoolInTransaction, setPartnerPoolOverageInTransaction } from "./partnerPool";
import { isLivePolarSubscriptionState, subscriptionEventEffect } from "./polarSubscriptions";
import { partnerRls, requirePartnerOwner } from "./partnerActors";
import type { PartnerActor } from "./partners";
import { periodKeyFor } from "./usage";

// A partner's tier: what it buys from the host through Polar. Only the
// partner's owners start a checkout. The worker creates the checkout with
// Polar, and reconciles Polar's events for the partner's customer
// (partner:<partner id>) into its billing account. A partner Polar never
// billed is on Free. Without tier products in Polar, the host bills no tier,
// and the partner's pool has no limit unless the host sets one with
// `pnpm partner-pool:set`. Nothing prices overage then, so that pool is the
// limit, with no overage and no cap.

/** The external id of the partner's Polar customer. */
export function partnerBillingKey(partnerId: string): string {
  return `partner:${partnerId}`;
}

/** The tier a partner holds, and what it gives the partner's businesses between them. */
export type PartnerTier = {
  /** Whether this deployment bills partners for tiers. Without it, only a pool the host set limits the businesses. */
  billed: boolean;
  /** A paid tier while its subscription is live, and Free otherwise. */
  tier: PartnerTierSlug;
  billingInterval: BillingInterval | null;
  /** Polar's state of the tier's subscription, or null for a partner Polar never billed. */
  subscriptionState: string | null;
  /**
   * The voice seconds and chats the businesses share each month, or null for
   * no limit. While the deployment bills tiers, it's the tier's and limits
   * both. Otherwise it's the pool the host set, where a null kind has no
   * limit, and null when the host set none.
   */
  pool: { voiceSeconds: number | null; chats: number | null } | null;
  /** Phone numbers the businesses hold between them before extra numbers cost more. */
  includedNumbers: number;
  /** 14-day trial numbers the partner gets, ever. */
  trialNumbers: number;
};

const accountColumns = {
  tier: partnerBillingAccounts.tier,
  billingInterval: partnerBillingAccounts.billingInterval,
  subscriptionState: partnerBillingAccounts.subscriptionState,
  customerId: partnerBillingAccounts.customerId,
  subscriptionId: partnerBillingAccounts.subscriptionId,
  currentPeriodEnd: partnerBillingAccounts.currentPeriodEnd,
  endsAt: partnerBillingAccounts.endsAt,
  poolVoiceSeconds: partnerBillingAccounts.poolVoiceSeconds,
  poolChats: partnerBillingAccounts.poolChats,
  includedNumbers: partnerBillingAccounts.includedNumbers,
  poolOverageEnabled: partnerBillingAccounts.poolOverageEnabled,
  poolOverageCapCents: partnerBillingAccounts.poolOverageCapCents,
  hostPoolVoiceSeconds: partnerBillingAccounts.hostPoolVoiceSeconds,
  hostPoolChats: partnerBillingAccounts.hostPoolChats,
};

async function readAccount(tx: DatabaseTransaction, partnerId: string) {
  return (await tx.select(accountColumns).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, partnerId)).limit(1))[0];
}

/** The pool the host set, while the deployment bills no tiers, or null when it set none. */
function hostPoolOf(account: Awaited<ReturnType<typeof readAccount>>): PartnerTier["pool"] {
  const voiceSeconds = account?.hostPoolVoiceSeconds ?? null;
  const chats = account?.hostPoolChats ?? null;
  return voiceSeconds === null && chats === null ? null : { voiceSeconds, chats };
}

function tierOf(account: Awaited<ReturnType<typeof readAccount>>): PartnerTier {
  const tier = partnerTierInForce(account);
  const terms = partnerTierCatalog[tier];
  const billed = partnerFeatures(process.env).tierBilling;
  // The account records the terms of the tier in force when the worker last reconciled it.
  return {
    billed,
    tier,
    billingInterval: tier === "free" ? null : account?.billingInterval ?? null,
    subscriptionState: account?.subscriptionState ?? null,
    pool: billed ? { voiceSeconds: account?.poolVoiceSeconds ?? terms.poolVoiceSeconds, chats: account?.poolChats ?? terms.poolChats } : hostPoolOf(account),
    includedNumbers: account?.includedNumbers ?? terms.includedNumbers,
    trialNumbers: terms.trialNumbers,
  };
}

/**
 * The partner's tier and what it gives its businesses. The caller's
 * transaction must be able to read the partner's billing account: the worker,
 * the system actor, or a member of the partner's team.
 */
export async function loadPartnerTierInTransaction(tx: DatabaseTransaction, partnerId: string): Promise<PartnerTier> {
  return tierOf(await readAccount(tx, partnerId));
}

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

/** A key reaches the partner's billing only with the scopes an owner grants. */
function billingActor(actor: PartnerActor): PartnerActor {
  return actor;
}

/** Refuses anyone who isn't an owner of the partner now, whatever role they arrived with, and keys no owner granted the scope. */
async function requireOwner(tx: DatabaseTransaction, member: PartnerActor, scope: "partner.billing:read" | "partner.billing:write" = "partner.billing:read"): Promise<void> {
  await requirePartnerOwner(tx, member, { scope, message: "Only owners manage the partner's billing." });
}

/**
 * The owner a checkout is made out to: the owner asking, or for a key, the
 * owner who granted its billing scopes while they still are one, since
 * Polar's checkout fills in a person's email.
 */
async function checkoutRequester(tx: DatabaseTransaction, actor: PartnerActor): Promise<string> {
  if (actor.kind === "member") return actor.userId;
  const owner = (await tx.execute<{ owner: string | null }>(sql`select app.partner_platform_key_owner(${actor.partnerId}::uuid, ${actor.platformKeyId}::uuid) as owner`)).rows[0]?.owner;
  if (!owner) throw failure("A key's checkout is made out to the owner who gave it its billing scopes, who is no longer an owner. Start the checkout from the console, or ask an owner to save the key again with them.", 409, "key_owner_inactive");
  return owner;
}

/** The lock every change to a partner's billing takes: checkouts and reconciling Polar's events. */
async function lockPartnerBilling(tx: DatabaseTransaction, partnerId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('partner-billing:' || ${partnerId}::uuid::text, 0))`);
}

/** The Billing page: the partner's tier and its subscription. Only owners read it. */
export type PartnerBilling = PartnerTier & {
  /** When the paid tier's current period ends, or null on Free. */
  currentPeriodEnd: string | null;
  /** When a tier the partner canceled ends, or null while it renews. */
  endsAt: string | null;
  /** Whether Polar's customer portal has a customer to open, to change, cancel or pay for the tier. */
  hasCustomerPortal: boolean;
  /** Phone numbers the partner's businesses hold between them. Each one past the included ones costs what the host pays for it. */
  numbersHeld: number;
  /** Whether the deployment counts those numbers against the tier and charges for extra ones, as it does while it bills tiers. */
  numbersCounted: boolean;
  /**
   * What the businesses used of the pool this month, and what its overage
   * costs so far in US cents, or null while nothing limits the pool: the
   * deployment bills no tiers and the host set no pool. Minutes count the
   * calls that ended, as the pool's alerts do: what open calls hold comes
   * back when they end.
   */
  poolUsage: { periodKey: string; voiceSecondsUsed: number; chatsUsed: number; overageSpendCents: number } | null;
  /**
   * Pool overage: on unless an owner turned it off, with its monthly cap in
   * US cents or none. Only a paid tier bills it, which `billed` says, so
   * Free stops at its pool whatever the switch says.
   */
  poolOverage: PoolOverage;
  /**
   * Free's one 14-day trial number, ever: whether one of the partner's
   * businesses can still get it, or used it. Null on a paid tier, or where
   * the deployment offers no trial: without tier billing, or on a
   * self-hosted server, whose businesses get no trial numbers.
   */
  trialNumber: "available" | "used" | null;
};

export type PoolOverage = { enabled: boolean; capCents: number | null; billed: boolean };

function poolOverageOf(account: Awaited<ReturnType<typeof readAccount>>, tier: PartnerTier): PoolOverage {
  return { enabled: account?.poolOverageEnabled ?? true, capCents: account?.poolOverageCapCents ?? null, billed: tier.billed && partnerTierCatalog[tier.tier].overagesBillable };
}

export async function getPartnerBilling(context: DomainContext, actor: PartnerActor): Promise<PartnerBilling> {
  const member = billingActor(actor);
  return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await requireOwner(tx, member);
    const account = await readAccount(tx, member.partnerId);
    const tier = tierOf(account);
    const numbers = await loadPartnerNumberStanding(tx, member.partnerId);
    const periodKey = periodKeyFor();
    const pool = tier.pool ? await readPartnerPoolInTransaction(tx, { partnerId: member.partnerId, periodKey }) : null;
    return {
      ...tier,
      currentPeriodEnd: tier.tier === "free" ? null : account?.currentPeriodEnd?.toISOString() ?? null,
      endsAt: tier.tier === "free" ? null : account?.endsAt?.toISOString() ?? null,
      hasCustomerPortal: Boolean(account?.customerId && account.subscriptionId),
      numbersHeld: numbers.held,
      numbersCounted: numbers.counted,
      poolUsage: pool ? { periodKey, voiceSecondsUsed: pool.month.voiceSecondsFinal, chatsUsed: pool.month.chatsUsed, overageSpendCents: Math.max(0, Math.ceil(poolSpendCents(pool) - 1e-9)) } : null,
      poolOverage: poolOverageOf(account, tier),
      trialNumber: tier.tier === "free" && numbers.counted && trialsOffered() ? (numbers.trialAvailable ? "available" : "used") : null,
    };
  });
}

/** Whether the partner's businesses can get trial numbers: they're made as cloud businesses unless the server is self-hosted, as tenancy makes them. */
function trialsOffered(): boolean {
  return parseDeploymentMode(process.env.DEPLOYMENT_MODE) !== "self_hosted_standard";
}

// The cap column is a Postgres integer.
const MAX_CAP_CENTS = 2_147_483_647;

/**
 * Turns the partner's pool overage on or off, and sets its monthly cap in US
 * cents or clears it. Past the pool, the partner's businesses keep answering
 * while overage is on and under the cap. With it off or at the cap, calls
 * forward and chat shows its "can't reply" message. Only owners change it.
 */
export async function setPartnerPoolOverage(context: DomainContext, actor: PartnerActor, input: { enabled: unknown; capCents: unknown }): Promise<PoolOverage> {
  const member = billingActor(actor);
  const { enabled, capCents } = input;
  if (typeof enabled !== "boolean") throw failure("enabled must be true or false.", 400, "invalid_pool_overage");
  if (capCents !== null && (typeof capCents !== "number" || !Number.isSafeInteger(capCents) || capCents < 0 || capCents > MAX_CAP_CENTS)) {
    throw failure("capCents must be a whole number of cents, or null for no cap.", 400, "invalid_pool_overage");
  }
  if (!partnerFeatures(process.env).tierBilling) throw failure("This deployment doesn't bill partners for tiers.", 409, "tier_billing_unavailable");
  return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await lockPartnerBilling(tx, member.partnerId);
    await requireOwner(tx, member, "partner.billing:write");
    await setPartnerPoolOverageInTransaction(tx, { partnerId: member.partnerId, enabled, capCents });
    const account = await readAccount(tx, member.partnerId);
    return poolOverageOf(account, tierOf(account));
  });
}

/**
 * Whether the console gives the partner's owners its Billing page: while the
 * deployment bills tiers, or once the host set the partner's pool. The
 * person must be on the partner's team; anyone else reads no account, so
 * gets false.
 */
export async function partnerHasBillingPage(context: DomainContext, input: { userId: string; partnerId: string }): Promise<boolean> {
  if (partnerFeatures(process.env).tierBilling) return true;
  return await withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async (tx) => hostPoolOf(await readAccount(tx, input.partnerId)) !== null);
}

/** A partner as the host names it to set its pool, and the pool it has now. */
export type PartnerHostPool = { partnerId: string; name: string; slug: string; pool: { voiceSeconds: number | null; chats: number | null } };

// The host's pool columns are Postgres integers.
const MAX_POOL_VALUE = 2_147_483_647;

/** The partner a host names: its id, its slug (its subdomain's first label), or one of its domains. */
async function findPartner(tx: DatabaseTransaction, reference: string): Promise<{ id: string; name: string; slug: string } | undefined> {
  const value = reference.trim().toLowerCase();
  const columns = { id: partners.id, name: partners.name, slug: partners.slug };
  const id = isUuid(value) ? value : null;
  if (id) return (await tx.select(columns).from(partners).where(eq(partners.id, id)).limit(1))[0];
  if (!value.includes(".")) return (await tx.select(columns).from(partners).where(eq(partners.slug, value)).limit(1))[0];
  // A partner's own domain names it only once verified, since other partners may claim it until then.
  return (await tx.select(columns).from(partnerDomains).innerJoin(partners, eq(partners.id, partnerDomains.partnerId))
    .where(and(eq(partnerDomains.hostname, value), or(eq(partnerDomains.kind, "subdomain"), isNotNull(partnerDomains.verifiedAt))))
    .limit(1))[0];
}

/** Whether a database error is this message raised by a function. */
function raised(error: unknown, message: string): boolean {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; current = (current as { cause?: unknown }).cause, depth += 1) {
    if ((current as { message?: unknown }).message === message) return true;
  }
  return false;
}

function poolCount(value: unknown, name: string, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw failure(`${name} must be a whole number from 0 to ${max}.`, 400, "invalid_host_pool");
  return value;
}

/**
 * The host sets a partner's pool on a deployment that bills no tiers: the
 * voice minutes and website chats its businesses share each month. A kind
 * the host leaves out keeps what it had, and `clear` removes both limits.
 * Nothing prices overage without tier billing, so the businesses stop at the
 * pool: calls forward and website chat shows its "can't reply" message. The
 * pool applies from the next reservation, and its alerts go to the partner's
 * owners and admins at 80% and 100%.
 *
 * Only the host's own tooling calls this, as the system actor. While the
 * deployment bills tiers, by this process's settings or as the worker last
 * recorded them, each partner's tier sets its pool, so this refuses a limit
 * and still clears one.
 */
export async function setPartnerHostPool(context: DomainContext, input: { partner: string; voiceMinutes?: unknown; chats?: unknown; clear?: boolean }): Promise<PartnerHostPool> {
  const minutes = poolCount(input.voiceMinutes, "minutes", Math.floor(MAX_POOL_VALUE / 60));
  const chats = poolCount(input.chats, "chats", MAX_POOL_VALUE);
  if (input.clear ? minutes !== undefined || chats !== undefined : minutes === undefined && chats === undefined) {
    throw failure("Set minutes, chats or both, or clear the pool.", 400, "invalid_host_pool");
  }
  const tierBilling = () => failure("This deployment bills partners for tiers, so each partner's tier sets its pool.", 409, "tier_billing_on");
  if (!input.clear && partnerFeatures(process.env).tierBilling) throw tierBilling();
  try {
    return await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => {
      const partner = await findPartner(tx, input.partner);
      if (!partner) throw failure(`No partner has the id, subdomain or domain ${input.partner.trim()}.`, 404, "partner_not_found");
      await lockPartnerBilling(tx, partner.id);
      const current = await readAccount(tx, partner.id);
      const pool = input.clear
        ? { voiceSeconds: null, chats: null }
        : { voiceSeconds: minutes === undefined ? current?.hostPoolVoiceSeconds ?? null : minutes * 60, chats: chats === undefined ? current?.hostPoolChats ?? null : chats };
      await tx.execute(sql`select app.set_partner_host_pool(${partner.id}::uuid, ${pool.voiceSeconds}::integer, ${pool.chats}::integer)`);
      return { partnerId: partner.id, name: partner.name, slug: partner.slug, pool };
    });
  } catch (error) {
    if (raised(error, "tier_billing_on")) throw tierBilling();
    throw error;
  }
}

/** Polar's customer for the partner, whose portal changes, cancels or pays for its tier. Only owners open it. */
export async function partnerBillingPortalCustomer(context: DomainContext, actor: PartnerActor): Promise<{ customerId: string }> {
  const member = billingActor(actor);
  return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await requireOwner(tx, member);
    const account = await readAccount(tx, member.partnerId);
    if (!account?.customerId || !account.subscriptionId) throw failure("Your partner has no tier in Polar to manage yet.", 409, "no_billing_customer");
    return { customerId: account.customerId };
  });
}

// We never learn that someone abandoned a Polar checkout, so one counts as
// open for 30 minutes, as a direct business's does.
const OPEN_CHECKOUT_WINDOW_MS = 30 * 60_000;
const CHECKOUT_LEASE_MS = 10 * 60_000;

/** An origin Polar can send the owner back to: http or https, with no path. */
function returnOrigin(value: string): string {
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && url.origin === value) return value;
  } catch {
    // Not a URL.
  }
  throw new Error("The console's origin must be an http or https origin.");
}

/**
 * Queues a Polar checkout for a paid tier, in the name of the owner asking,
 * whose email Polar fills in. Polar sends them back to `returnOrigin`, the
 * console's origin they started from. A partner whose tier is live changes
 * it from Polar's customer portal instead, and only one person's checkout is
 * open at a time. Asking again for the same checkout returns it, and asking
 * for another tier replaces your own.
 */
export async function createPartnerTierCheckout(
  context: DomainContext,
  actor: PartnerActor,
  input: { tier: string; billingInterval: string; returnOrigin: string },
): Promise<{ requestId: string }> {
  const member = billingActor(actor);
  const { tier, billingInterval } = input;
  if (!isPaidPartnerTierSlug(tier)) throw failure("tier must be starter, growth or scale.", 400, "invalid_tier");
  if (!isBillingInterval(billingInterval)) throw failure("billingInterval must be monthly or annual.", 400, "invalid_interval");
  const origin = returnOrigin(input.returnOrigin);
  if (!partnerFeatures(process.env).tierBilling) throw failure("This deployment doesn't bill partners for tiers.", 409, "tier_billing_unavailable");

  // The job belongs to no business, so it's queued as the system actor; the owner check comes first.
  return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "system" }, async (tx) => {
    await lockPartnerBilling(tx, member.partnerId);
    await requireOwner(tx, member, "partner.billing:write");
    const requester = await checkoutRequester(tx, member);
    if (tierOf(await readAccount(tx, member.partnerId)).tier !== "free") {
      throw failure("Your partner already pays for a tier. Change it from Manage subscription.", 409, billingErrorCodes.subscriptionActive);
    }
    const [open] = await tx.select({ id: partnerCheckoutRequests.id, requestedByUserId: partnerCheckoutRequests.requestedByUserId, tier: partnerCheckoutRequests.tier, billingInterval: partnerCheckoutRequests.billingInterval, returnOrigin: partnerCheckoutRequests.returnOrigin })
      .from(partnerCheckoutRequests)
      .where(and(eq(partnerCheckoutRequests.partnerId, member.partnerId), inArray(partnerCheckoutRequests.status, ["pending", "processing", "ready"]), gt(partnerCheckoutRequests.createdAt, new Date(Date.now() - OPEN_CHECKOUT_WINDOW_MS))))
      .orderBy(desc(partnerCheckoutRequests.createdAt))
      .limit(1);
    if (open) {
      if (open.requestedByUserId !== requester) throw failure("Another owner's checkout is already open.", 409, billingErrorCodes.checkoutInProgress);
      if (open.tier === tier && open.billingInterval === billingInterval && open.returnOrigin === origin) return { requestId: open.id };
      // Polar allows one active subscription per customer, so paying in both tabs can't start two.
      await tx.update(partnerCheckoutRequests).set({ status: "superseded", updatedAt: new Date() }).where(eq(partnerCheckoutRequests.id, open.id));
    }
    const [request] = await tx.insert(partnerCheckoutRequests).values({ partnerId: member.partnerId, requestedByUserId: requester, tier, billingInterval, returnOrigin: origin }).returning({ id: partnerCheckoutRequests.id });
    if (!request) throw new Error("Partner checkout request could not be created.");
    await enqueueOutbox(tx, {
      topic: "billing.createPartnerCheckout",
      aggregateType: "partner_checkout_request",
      aggregateId: request.id,
      dedupeKey: `partner-checkout:${request.id}`,
      payload: { partnerId: member.partnerId, requestId: request.id },
    });
    return { requestId: request.id };
  });
}

/** A checkout as the Billing page follows it. */
export type PartnerTierCheckout = {
  requestId: string;
  tier: PaidPartnerTierSlug;
  billingInterval: BillingInterval;
  status: "pending" | "processing" | "ready" | "error" | "superseded";
  checkoutUrl: string | null;
  /** Whether the partner now holds the tier the checkout sold, once Polar's events have reconciled. */
  synced: boolean;
};

export async function getPartnerTierCheckout(context: DomainContext, actor: PartnerActor, input: { requestId: string }): Promise<PartnerTierCheckout> {
  const member = billingActor(actor);
  return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await requireOwner(tx, member);
    const [row] = await tx.select({ requestId: partnerCheckoutRequests.id, tier: partnerCheckoutRequests.tier, billingInterval: partnerCheckoutRequests.billingInterval, status: partnerCheckoutRequests.status, checkoutUrl: partnerCheckoutRequests.checkoutUrl })
      .from(partnerCheckoutRequests)
      .where(and(eq(partnerCheckoutRequests.id, input.requestId), eq(partnerCheckoutRequests.partnerId, member.partnerId)))
      .limit(1);
    if (!row) throw failure("Checkout not found.", 404, "not_found");
    const tier = tierOf(await readAccount(tx, member.partnerId));
    return { ...row, synced: tier.tier === row.tier && tier.billingInterval === row.billingInterval };
  });
}

/** Takes a checkout for this worker, or one whose earlier run died holding it. */
export async function claimPartnerCheckoutRequest(context: DomainContext, input: { partnerId: string; requestId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => {
    const staleBefore = new Date(Date.now() - CHECKOUT_LEASE_MS);
    const rows = await tx.update(partnerCheckoutRequests).set({ status: "processing", error: null, updatedAt: new Date() }).where(and(
      eq(partnerCheckoutRequests.id, input.requestId),
      eq(partnerCheckoutRequests.partnerId, input.partnerId),
      or(eq(partnerCheckoutRequests.status, "pending"), eq(partnerCheckoutRequests.status, "error"), and(eq(partnerCheckoutRequests.status, "processing"), lt(partnerCheckoutRequests.updatedAt, staleBefore))),
    )).returning({ id: partnerCheckoutRequests.id });
    return rows.length > 0;
  });
}

/** When another run holds this checkout, the time its lease ends and it may be claimed again. */
export async function partnerCheckoutLeaseEndsAt(context: DomainContext, input: { partnerId: string; requestId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({ updatedAt: partnerCheckoutRequests.updatedAt }).from(partnerCheckoutRequests).where(and(eq(partnerCheckoutRequests.id, input.requestId), eq(partnerCheckoutRequests.partnerId, input.partnerId), eq(partnerCheckoutRequests.status, "processing"))).limit(1);
    return row ? new Date(row.updatedAt.getTime() + CHECKOUT_LEASE_MS) : null;
  });
}

/** What the worker sends Polar to make the checkout page. */
export async function loadPartnerCheckoutRequest(context: DomainContext, input: { partnerId: string; requestId: string }): Promise<{
  requestId: string;
  partnerId: string;
  tier: PaidPartnerTierSlug;
  billingInterval: BillingInterval;
  returnOrigin: string;
  customerEmail: string;
  externalCustomerId: string;
} | null> {
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({ requestId: partnerCheckoutRequests.id, partnerId: partnerCheckoutRequests.partnerId, tier: partnerCheckoutRequests.tier, billingInterval: partnerCheckoutRequests.billingInterval, returnOrigin: partnerCheckoutRequests.returnOrigin, customerEmail: users.email })
      .from(partnerCheckoutRequests)
      .innerJoin(users, eq(users.id, partnerCheckoutRequests.requestedByUserId))
      .where(and(eq(partnerCheckoutRequests.id, input.requestId), eq(partnerCheckoutRequests.partnerId, input.partnerId)))
      .limit(1);
    if (!row || !isPaidPartnerTierSlug(row.tier) || !isBillingInterval(row.billingInterval)) return null;
    return { ...row, externalCustomerId: partnerBillingKey(row.partnerId) };
  });
}

export async function markPartnerCheckoutCreated(context: DomainContext, input: { partnerId: string; requestId: string; checkoutId: string; checkoutUrl: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => {
    const rows = await tx.update(partnerCheckoutRequests).set({ status: "ready", checkoutId: input.checkoutId, checkoutUrl: input.checkoutUrl, error: null, updatedAt: new Date() }).where(and(eq(partnerCheckoutRequests.id, input.requestId), eq(partnerCheckoutRequests.partnerId, input.partnerId), eq(partnerCheckoutRequests.status, "processing"))).returning({ id: partnerCheckoutRequests.id });
    return rows.length > 0;
  });
}

export async function markPartnerCheckoutFailed(context: DomainContext, input: { partnerId: string; requestId: string; error: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => {
    const rows = await tx.update(partnerCheckoutRequests).set({ status: "error", error: input.error, updatedAt: new Date() }).where(and(eq(partnerCheckoutRequests.id, input.requestId), eq(partnerCheckoutRequests.partnerId, input.partnerId), eq(partnerCheckoutRequests.status, "processing"))).returning({ id: partnerCheckoutRequests.id });
    return rows.length > 0;
  });
}

/**
 * Stores a signed Polar event for a partner's customer once, and queues its
 * reconcile. An event for a partner this deployment doesn't have is dropped.
 */
export async function recordPartnerPolarEvent(
  context: DomainContext,
  input: { partnerId: string; providerEventId: string; eventType: string; payload: Record<string, unknown> },
): Promise<"stored" | "duplicate" | "unknown_partner"> {
  return await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => {
    const [partner] = await tx.select({ id: partners.id }).from(partners).where(eq(partners.id, input.partnerId)).limit(1);
    if (!partner) return "unknown_partner";
    const [stored] = await tx.insert(providerEvents).values({ provider: "polar", providerEventId: input.providerEventId, eventType: input.eventType, partnerId: partner.id, payload: input.payload }).onConflictDoNothing().returning({ id: providerEvents.id });
    if (!stored) return "duplicate";
    await enqueueOutbox(tx, {
      topic: "billing.reconcilePartner",
      aggregateType: "provider_event",
      aggregateId: stored.id,
      dedupeKey: `provider-event:${input.providerEventId}:partner-billing`,
      payload: { partnerId: partner.id, providerEventId: stored.id },
    });
    return "stored";
  });
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function date(source: Record<string, unknown>, ...keys: string[]): Date | undefined {
  const value = text(source, ...keys);
  const parsed = value ? new Date(value) : undefined;
  return parsed && !Number.isNaN(parsed.valueOf()) ? parsed : undefined;
}

/**
 * Applies one of Polar's events for the partner's customer to its billing
 * account: the tier Polar sold, its interval and subscription state, and the
 * terms of the tier in force, which is Free unless a paid tier is live. The
 * change then moves the partner through its lifecycle: a failed payment or a
 * tier that ended starts the 30 days its businesses keep answering, and a
 * tier paid for again makes it active. An event older than one already
 * applied leaves the subscription as it is, so a late retry can't roll it
 * back. Returns false when the event isn't the partner's, or is a support
 * plan the partner's account doesn't follow.
 */
export async function reconcilePartnerTier(context: DomainContext, input: { partnerId: string; providerEventId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => {
    // Polar can deliver several events for one checkout at once, such as subscription.active beside order.paid.
    await lockPartnerBilling(tx, input.partnerId);
    const [event] = await tx.select({ id: providerEvents.id, eventType: providerEvents.eventType, status: providerEvents.status, payload: providerEvents.payload })
      .from(providerEvents)
      .where(and(eq(providerEvents.id, input.providerEventId), eq(providerEvents.partnerId, input.partnerId)))
      .limit(1);
    if (!event) return false;
    if (event.status === "processed") return true;

    const payload = record(event.payload);
    const isSubscription = event.eventType.startsWith("subscription.");
    // An order carries its subscription nested; a subscription event is the subscription.
    const subscription = isSubscription ? payload : record(payload.subscription);
    const existing = (await tx.select({ ...accountColumns, currentPeriodStart: partnerBillingAccounts.currentPeriodStart }).from(partnerBillingAccounts).where(eq(partnerBillingAccounts.partnerId, input.partnerId)).limit(1))[0];
    const customerId = text(payload, "customerId") ?? existing?.customerId ?? null;
    // polar-event.ts names the tier only from a subscription's product. A product that sells no tier keeps the stored one.
    const tier = isPaidPartnerTierSlug(payload.partnerTier) ? payload.partnerTier : undefined;
    const billingInterval = tier && isBillingInterval(payload.billingInterval) ? payload.billingInterval : undefined;
    const subscriptionState = text(payload, "subscriptionState") ?? (isSubscription ? text(payload, "status") ?? event.eventType.slice("subscription.".length) : undefined);
    const eventSubscriptionId = text(payload, "subscriptionId") ?? text(subscription, "id");
    // One Polar customer can hold several subscriptions, so the event changes the tier only when
    // it's about the subscription the account stores, or a live tier that replaces it.
    // A support plan, or a product from the other catalog, sells this account nothing.
    const sellsNothing = payload.selfHostedSupport === true || payload.foreignProduct === true;
    const effect = subscriptionEventEffect({
      storedSubscriptionId: existing?.subscriptionId,
      eventSubscriptionId,
      sellsNothing,
      startsLivePlan: tier !== undefined && isLivePolarSubscriptionState(subscriptionState),
    });
    // A support plan the account doesn't follow is the partner's purchase of support, not a tier.
    if (sellsNothing && effect === "ignore") {
      await tx.update(providerEvents).set({ status: "ignored", updatedAt: new Date() }).where(eq(providerEvents.id, event.id));
      return false;
    }
    // Both sides are ISO strings polar-event.ts normalized, so text order is time order.
    // Only the same subscription's snapshots count: another of the customer's subscriptions is no newer copy of this one.
    const modifiedAt = text(payload, "subscriptionModifiedAt");
    const stale = modifiedAt !== undefined && (await tx.select({ id: providerEvents.id }).from(providerEvents)
      .where(and(
        eq(providerEvents.partnerId, input.partnerId),
        eq(providerEvents.status, "processed"),
        sql`${providerEvents.payload}->>'subscriptionModifiedAt' > ${modifiedAt}`,
        ...(eventSubscriptionId ? [sql`${providerEvents.payload}->>'subscriptionId' = ${eventSubscriptionId}`] : []),
      ))
      .limit(1)).length > 0;
    // Another of the customer's subscriptions leaves the tier as it is.
    const skip = stale || effect === "ignore";
    // The tier's own subscription now sells support, so the tier ends with it.
    const ends = effect === "end";

    const next = skip ? existing : {
      tier: ends ? existing?.tier ?? "free" : tier ?? existing?.tier ?? "free",
      billingInterval: ends ? existing?.billingInterval ?? null : billingInterval ?? existing?.billingInterval ?? null,
      subscriptionState: ends ? "canceled" : subscriptionState ?? existing?.subscriptionState ?? null,
      subscriptionId: eventSubscriptionId ?? existing?.subscriptionId ?? null,
      currentPeriodStart: (ends ? undefined : date(subscription, "current_period_start", "currentPeriodStart")) ?? existing?.currentPeriodStart ?? null,
      currentPeriodEnd: (ends ? undefined : date(subscription, "current_period_end", "currentPeriodEnd")) ?? existing?.currentPeriodEnd ?? null,
    };
    const inForce = partnerTierInForce(next ?? null);
    const terms = partnerTierCatalog[inForce];
    // A snapshot of the subscription says whether it runs to the end of its period; an event without one leaves that as it was.
    const snapshot = typeof subscription.cancel_at_period_end === "boolean";
    const endsAt = !snapshot || skip ? existing?.endsAt ?? null : subscription.cancel_at_period_end === true && inForce !== "free" ? date(subscription, "ends_at", "current_period_end") ?? null : null;
    const fields = skip && existing ? { customerId, updatedAt: new Date() } : {
      customerId,
      tier: next?.tier ?? "free",
      billingInterval: next?.billingInterval ?? null,
      subscriptionState: next?.subscriptionState ?? null,
      subscriptionId: next?.subscriptionId ?? null,
      currentPeriodStart: next?.currentPeriodStart ?? null,
      currentPeriodEnd: next?.currentPeriodEnd ?? null,
      endsAt,
      poolVoiceSeconds: terms.poolVoiceSeconds,
      poolChats: terms.poolChats,
      includedNumbers: terms.includedNumbers,
      updatedAt: new Date(),
    };
    await tx.insert(partnerBillingAccounts).values({
      partnerId: input.partnerId,
      billingKey: partnerBillingKey(input.partnerId),
      poolVoiceSeconds: terms.poolVoiceSeconds,
      poolChats: terms.poolChats,
      includedNumbers: terms.includedNumbers,
      ...fields,
    }).onConflictDoUpdate({ target: partnerBillingAccounts.partnerId, set: fields });
    // The change moves the partner through its lifecycle, at the time Polar gives it: when the subscription ended, or when it changed.
    const kind = skip ? null : partnerTierEventKind(existing, next);
    if (kind) {
      const now = new Date();
      const reported = (kind === "tier_cancelled" ? date(subscription, "ended_at", "endedAt") : undefined) ?? (modifiedAt ? new Date(modifiedAt) : undefined);
      await advancePartnerInTransaction(tx, input.partnerId, { kind, at: reported && reported < now ? reported : now });
    }
    await tx.update(providerEvents).set({ status: "processed", updatedAt: new Date() }).where(eq(providerEvents.id, event.id));
    return true;
  });
}
