import { and, asc, eq, inArray, lte, notInArray, or, sql } from "drizzle-orm";

import { businesses, partnerLifecycleEvents, partnerLifecycles, partnerMembers, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { partnerTierInForce, type PartnerTierAccount } from "@lobbystack/shared";

import { AuthorizationError } from "../authz";
import type { DomainContext } from "./context";
import { businessPaymentsToEndInTransaction, closeCheckoutQuietly } from "./packageBilling";
import { deletePartnerBusinessInTransaction, type PartnerActor } from "./partners";

// The partner lifecycle: what happens to a partner's businesses once its paid
// tier ends. When the tier is cancelled or a payment fails, the businesses
// keep answering for 30 days, and the partner can release them. Then they
// pause: loadEntitlement gives them no allowance, so calls forward and chat
// shows its "can't reply" message. The host deletes them 90 days after the
// tier ended, releasing their numbers as a deleted business's are, and
// cancelling the subscription that paid for a business's package first. A
// partner that pays for a tier again is active again. A partner whose paid
// tier never ended, Free included, stays active, and once the host deleted
// a partner's businesses, the ones it makes later answer as on Free.
// nextPartnerState decides each step with no I/O. The worker applies it when
// it reconciles Polar's events for the partner, and each hour for the steps
// the clock takes.

export const partnerStates = ["active", "past_due", "ending", "paused", "deleted"] as const;
export type PartnerState = (typeof partnerStates)[number];

/** What moves a partner: Polar's news of its tier, or the hourly clock. */
export type PartnerEvent = { kind: "tier_paid" | "tier_failed" | "tier_cancelled" | "clock"; at: Date };

/**
 * Where a partner stands. `since` is when it got there, except while it's
 * past due or ending, when it's when its 30 days began: the failed payment
 * or the tier's end, whichever came first. `tierEndedAt` is when the paid
 * tier ended, which the 90 days count from, or null while it hasn't: a past
 * due tier Polar still retries is in force.
 */
export type PartnerStanding = { state: PartnerState; since: Date; tierEndedAt: Date | null };

/** Days a partner's businesses keep answering after its tier ends or a payment fails. */
export const PARTNER_ANSWERING_DAYS = 30;
/** Days after the tier ended that the host deletes the businesses. */
export const PARTNER_DELETION_DAYS = 90;
const DAY_MS = 24 * 60 * 60_000;
const daysAfter = (time: Date, days: number) => new Date(time.getTime() + days * DAY_MS);

export function isPartnerState(value: unknown): value is PartnerState {
  return typeof value === "string" && (partnerStates as readonly string[]).includes(value);
}

/**
 * When the businesses pause, 30 days after the tier ended or a payment
 * failed, and when the host deletes them, 90 days after the tier ended.
 * Null for a step the partner is past or won't take yet: an active partner
 * has no deadline, and a past due one has no deletion until its tier ends.
 */
export function partnerLifecycleDeadlines(current: PartnerStanding): { pausesAt: Date | null; deletesAt: Date | null } {
  const deletesAt = current.tierEndedAt ? daysAfter(current.tierEndedAt, PARTNER_DELETION_DAYS) : null;
  switch (current.state) {
    case "past_due":
    case "ending":
      return { pausesAt: daysAfter(current.since, PARTNER_ANSWERING_DAYS), deletesAt };
    case "paused":
      return { pausesAt: null, deletesAt };
    default:
      return { pausesAt: null, deletesAt: null };
  }
}

/**
 * The days that matter to a partner whose tier ended or whose payment
 * failed: when the tier ended, when the businesses pause, and when the host
 * deletes them, past or to come. Each is null when it isn't known: the tier
 * of a past due partner hasn't ended, so its deletion has no date yet, and a
 * deleted partner's businesses have gone. Null for an active partner.
 */
export function partnerLifecycleDates(current: PartnerStanding): { tierEndedAt: Date | null; pausesAt: Date | null; deletesAt: Date | null } | null {
  switch (current.state) {
    case "active":
      return null;
    case "deleted":
      return { tierEndedAt: current.tierEndedAt, pausesAt: null, deletesAt: current.since };
    case "paused":
      return { tierEndedAt: current.tierEndedAt, pausesAt: current.since, deletesAt: partnerLifecycleDeadlines(current).deletesAt };
    default:
      return { tierEndedAt: current.tierEndedAt, ...partnerLifecycleDeadlines(current) };
  }
}

/** Where the partner stands after the event. It returns `current` itself when the event doesn't move it. */
export function nextPartnerState(current: PartnerStanding, event: PartnerEvent): PartnerStanding {
  switch (event.kind) {
    // Paying for a tier again makes the partner active, from any state.
    case "tier_paid":
      return current.state === "active" ? current : { state: "active", since: event.at, tierEndedAt: null };
    // The first failed payment starts the 30 days, and Polar's retries failing don't start them over.
    case "tier_failed":
      return current.state === "active" ? { state: "past_due", since: event.at, tierEndedAt: null } : current;
    case "tier_cancelled":
      if (current.state === "active") return { state: "ending", since: event.at, tierEndedAt: event.at };
      // A tier that ends after a failed payment still pauses 30 days after that payment, and the 90 days count from its end.
      if (current.state === "past_due") return { state: "ending", since: current.since < event.at ? current.since : event.at, tierEndedAt: event.at };
      // A partner that paused while Polar retried its payment learns when the tier ended.
      if (current.state === "paused" && !current.tierEndedAt) return { ...current, tierEndedAt: event.at };
      return current;
    case "clock": {
      // Each step starts at its deadline, not when the clock noticed, so a late run moves no deadline.
      const { pausesAt, deletesAt } = partnerLifecycleDeadlines(current);
      if (deletesAt && event.at >= deletesAt) return { state: "deleted", since: deletesAt, tierEndedAt: current.tierEndedAt };
      if (pausesAt && event.at >= pausesAt) return { state: "paused", since: pausesAt, tierEndedAt: current.tierEndedAt };
      return current;
    }
  }
}

/**
 * The event a reconcile of the partner's tier makes, from the tier's account
 * before and after it, or null for none. A live paid tier is paid, or failed
 * while its subscription is past_due. A paid tier no longer in force was
 * cancelled, whether the partner cancelled it or Polar revoked it. A partner
 * that never held a paid tier never enters the lifecycle.
 */
export function partnerTierEventKind(before: PartnerTierAccount | null | undefined, after: PartnerTierAccount | null | undefined): Exclude<PartnerEvent["kind"], "clock"> | null {
  if (partnerTierInForce(after) !== "free") return after?.subscriptionState === "past_due" ? "tier_failed" : "tier_paid";
  return partnerTierInForce(before) !== "free" ? "tier_cancelled" : null;
}

/**
 * Where the partner stands, as the worker or someone on the partner's team
 * reads it. A partner with no row is active.
 */
export async function loadPartnerLifecycleInTransaction(tx: DatabaseTransaction, partnerId: string): Promise<PartnerStanding> {
  const [row] = await tx.select({ state: partnerLifecycles.state, since: partnerLifecycles.since, tierEndedAt: partnerLifecycles.tierEndedAt }).from(partnerLifecycles).where(eq(partnerLifecycles.partnerId, partnerId)).limit(1);
  // A partner whose tier never ended has no time it got there.
  return row && isPartnerState(row.state) ? { state: row.state, since: row.since, tierEndedAt: row.tierEndedAt } : { state: "active", since: new Date(0), tierEndedAt: null };
}

/** Where the partner stands, as the console shows its owners and admins. Each date is null while it isn't known, and all are while the partner is active. */
export type PartnerLifecycleSummary = {
  state: PartnerState;
  /** When the paid tier ended, or null while a past due tier is still in force. */
  tierEndedAt: string | null;
  /** When the businesses pause: 30 days after the tier ended or a payment failed. */
  pausesAt: string | null;
  /** When the host deletes them: 90 days after the tier ended. */
  deletesAt: string | null;
};

/**
 * Where the partner stands since its paid tier ended or a payment failed,
 * with the days that matter: when its tier ended, when its businesses pause
 * and when the host deletes them. Owners and admins read it, since they keep
 * the businesses running: owners pay for a tier, and both release businesses
 * to their owners. Members don't.
 */
export async function getPartnerLifecycle(context: DomainContext, actor: PartnerActor): Promise<PartnerLifecycleSummary> {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't read where a partner's tier stands.");
  return await withBusinessTransaction(context.db, { userId: actor.userId, actorType: "operator" }, async (tx) => {
    const [member] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, actor.partnerId), eq(partnerMembers.userId, actor.userId), eq(partnerMembers.status, "active"))).limit(1);
    if (!member) throw new AuthorizationError("You aren't on this partner's team.");
    if (member.role === "member") throw new AuthorizationError("Only owners and admins see where the partner's tier stands.");
    const standing = await loadPartnerLifecycleInTransaction(tx, actor.partnerId);
    const dates = partnerLifecycleDates(standing);
    return { state: standing.state, tierEndedAt: dates?.tierEndedAt?.toISOString() ?? null, pausesAt: dates?.pausesAt?.toISOString() ?? null, deletesAt: dates?.deletesAt?.toISOString() ?? null };
  });
}

/**
 * Whether the partner's business answers now, for loadEntitlement: until
 * the partner's businesses pause, and again once the partner pays for a
 * tier. A business the partner made after the host deleted the others
 * answers too. It reads through app.partner_business_answers, which answers
 * inside the business or for someone on the partner's team. A transaction
 * that can't read it gets false, as one that can't read a package gets no
 * allowance.
 */
export async function partnerBusinessAnswersInTransaction(tx: DatabaseTransaction, businessId: string): Promise<boolean> {
  const answers = (await tx.execute<{ answers: boolean | null }>(sql`select app.partner_business_answers(${businessId}::uuid) as answers`)).rows[0]?.answers;
  return answers === true;
}

/** Every step takes the partner's lifecycle lock, so two never apply at once. */
async function lockPartnerLifecycle(tx: DatabaseTransaction, partnerId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('partner-lifecycle:' || ${partnerId}::uuid::text, 0))`);
}

/**
 * Applies a step: stores where the partner stands now, records the step in
 * partner_lifecycle_events, and writes it to the audit log of each of the
 * partner's businesses. The businesses follow the state from then on: once
 * they stop answering, loadEntitlement gives them no allowance, and they
 * answer again as soon as the partner is active. Deleting the businesses of
 * a partner that reached deletion takes a transaction each, so
 * advancePartnerLifecycles does that after this step commits. Returns how
 * many businesses' logs it wrote to. Runs in the worker's transaction, under
 * the partner's lifecycle lock.
 */
export async function applyPartnerTransition(tx: DatabaseTransaction, input: { partnerId: string; from: PartnerStanding; to: PartnerStanding; event: PartnerEvent }): Promise<number> {
  const { partnerId, from, to, event } = input;
  const now = new Date();
  const stored = { state: to.state, since: to.since, tierEndedAt: to.tierEndedAt };
  await tx.insert(partnerLifecycles).values({ partnerId, ...stored, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: partnerLifecycles.partnerId, set: { ...stored, updatedAt: now } });
  await tx.insert(partnerLifecycleEvents).values({
    partnerId,
    eventType: "partner.lifecycle_changed",
    payload: { from: from.state, to: to.state, since: to.since.toISOString(), tierEndedAt: to.tierEndedAt?.toISOString() ?? null, event: event.kind },
  });
  const [row] = (await tx.execute<{ audited: number }>(sql`select app.audit_partner_lifecycle_step(${partnerId}::uuid, ${from.state}, ${to.state}, ${to.since.toISOString()}::timestamptz, ${event.kind}) as audited`)).rows;
  return Number(row?.audited ?? 0);
}

/**
 * Moves the partner by one event and applies the step when there is one.
 * Returns where the partner stands now, and whether it moved. Runs in the
 * worker's transaction, which it locks for the partner's lifecycle.
 */
export async function advancePartnerInTransaction(tx: DatabaseTransaction, partnerId: string, event: PartnerEvent): Promise<{ standing: PartnerStanding; moved: boolean }> {
  await lockPartnerLifecycle(tx, partnerId);
  const from = await loadPartnerLifecycleInTransaction(tx, partnerId);
  const to = nextPartnerState(from, event);
  if (to === from) return { standing: from, moved: false };
  await applyPartnerTransition(tx, { partnerId, from, to, event });
  return { standing: to, moved: true };
}

const ADVANCE_BATCH = 100;
const ADVANCE_ROUNDS = 10;

/** Some partners couldn't move, or some of their businesses couldn't be deleted. They wait for the next run. */
export class PartnerLifecycleError extends Error {
  constructor(readonly failures: Array<{ partnerId: string; businessId?: string; error: unknown }>) {
    const first = failures[0]?.error;
    const businesses = failures.filter((failure) => failure.businessId).length;
    const partners = failures.length - businesses;
    const what = [
      partners ? `move ${partners} ${partners === 1 ? "partner" : "partners"} through the lifecycle` : null,
      businesses ? `delete ${businesses} ${businesses === 1 ? "business" : "businesses"} of partners that reached deletion` : null,
    ].filter(Boolean).join(" or ");
    super(`Couldn't ${what}; the next run tries again. First error: ${first instanceof Error ? first.message : String(first)}`, { cause: first });
    this.name = "PartnerLifecycleError";
  }
}

/**
 * Whether the business is still one the host deletes now: its partner
 * reached deletion and it's still the partner's. Under the partner's
 * lifecycle lock, so it deletes nothing once the partner pays for a tier
 * again. The transaction is the worker's, scoped to the business.
 */
async function dueForDeletion(tx: DatabaseTransaction, input: { partnerId: string; businessId: string }): Promise<boolean> {
  await lockPartnerLifecycle(tx, input.partnerId);
  if ((await loadPartnerLifecycleInTransaction(tx, input.partnerId)).state !== "deleted") return false;
  const [business] = await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  return business?.partnerId === input.partnerId.toLowerCase();
}

/**
 * Deletes one business of a partner that reached deletion, as the partner
 * deleting it would: its numbers go back to the provider through the release
 * a deleted business's numbers get, and everything in it goes, a suspended
 * business's too. The subscription that paid for its package must be the one
 * the worker cancelled. It records the deletion, with the numbers it
 * released, in partner_lifecycle_events, which outlives the business.
 * Returns the checkout to close, or null when the business needed no
 * deleting. The transaction is the worker's, scoped to the business.
 */
async function deleteLifecycleBusinessInTransaction(tx: DatabaseTransaction, input: { partnerId: string; businessId: string; stripeConnect: boolean; cancelledSubscriptionId: string | null }) {
  if (!await dueForDeletion(tx, input)) return { deleted: false, checkout: null };
  const { checkout, releasedNumbers } = await deletePartnerBusinessInTransaction(tx, { ...input, by: "lifecycle" });
  await tx.insert(partnerLifecycleEvents).values({
    partnerId: input.partnerId,
    eventType: "partner.business_deleted",
    businessId: input.businessId,
    payload: { businessId: input.businessId, releasedNumbers, cancelledSubscriptionId: input.cancelledSubscriptionId },
  });
  return { deleted: true, checkout };
}

/**
 * Deletes the businesses of each partner that reached deletion, 90 days
 * after its tier ended. For each one, it first closes the checkout someone
 * may still pay and cancels the subscription that pays for its package, so
 * its owner pays nothing more for a business that's gone, then deletes it in
 * its own transaction. A business whose number is still being bought waits
 * for the next run, and so does one whose owner started paying again
 * meanwhile. One the partner released or deleted needs nothing. A
 * subscription the worker couldn't cancel leaves its business for the next
 * run too, as a failure.
 */
async function deleteDueBusinesses(context: DomainContext, failures: Array<{ partnerId: string; businessId?: string; error: unknown }>): Promise<{ deleted: number; waiting: number }> {
  const stripe = context.stripeConnect ?? null;
  const stripeConnect = Boolean(stripe);
  const seen: string[] = [];
  let deleted = 0;
  let waiting = 0;
  for (let round = 0; round < ADVANCE_ROUNDS; round += 1) {
    const due = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => (await tx.execute<{ partnerId: string; businessId: string }>(
      sql`select partner_id as "partnerId", business_id as "businessId" from app.partner_businesses_due_for_deletion(${ADVANCE_BATCH}, ${`{${seen.join(",")}}`}::uuid[])`,
    )).rows);
    if (!due.length) break;
    for (const { partnerId, businessId } of due) {
      seen.push(businessId);
      try {
        const payments = await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => await dueForDeletion(tx, { partnerId, businessId }) ? await businessPaymentsToEndInTransaction(tx, { businessId, partnerId, stripeConnect }) : null);
        if (!payments) continue;
        await closeCheckoutQuietly(context, payments.checkout);
        // A subscription is only ever named with Stripe Connect at hand.
        if (stripe && payments.subscription) await stripe.cancelSubscription(payments.subscription.accountId, payments.subscription.subscriptionId);
        const cancelledSubscriptionId = payments.subscription?.subscriptionId ?? null;
        const result = await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => await deleteLifecycleBusinessInTransaction(tx, { partnerId, businessId, stripeConnect, cancelledSubscriptionId }));
        if (result.deleted) deleted += 1;
        await closeCheckoutQuietly(context, result.checkout);
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === "business_number_in_progress" || code === "subscription_active") waiting += 1;
        else if (code !== "business_not_found") failures.push({ partnerId, businessId, error });
      }
    }
  }
  return { deleted, waiting };
}

/**
 * The hourly clock: sends a clock event to each partner whose businesses are
 * due to pause or to be deleted, each in its own transaction, then deletes
 * the businesses of the partners that reached deletion. Returns how many
 * partners moved, how many businesses it deleted, and how many wait for the
 * next run. When one fails, the others still go on, and the run then throws
 * a PartnerLifecycleError naming the failures.
 */
export async function advancePartnerLifecycles(context: DomainContext, input: { now?: Date } = {}): Promise<{ moved: number; deleted: number; waiting: number }> {
  const now = input.now ?? new Date();
  // Partners that might be due: to pause 30 days after their days began, or
  // to reach deletion 90 days after their tier ended. nextPartnerState
  // decides under the lock.
  const pausesBy = new Date(now.getTime() - PARTNER_ANSWERING_DAYS * DAY_MS);
  const deletesBy = new Date(now.getTime() - PARTNER_DELETION_DAYS * DAY_MS);
  const seen: string[] = [];
  const failures: Array<{ partnerId: string; businessId?: string; error: unknown }> = [];
  let moved = 0;
  for (let round = 0; round < ADVANCE_ROUNDS; round += 1) {
    const due = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await tx.select({ partnerId: partnerLifecycles.partnerId })
      .from(partnerLifecycles)
      .where(and(
        or(
          and(inArray(partnerLifecycles.state, ["past_due", "ending"]), lte(partnerLifecycles.since, pausesBy)),
          and(inArray(partnerLifecycles.state, ["ending", "paused"]), lte(partnerLifecycles.tierEndedAt, deletesBy)),
        ),
        seen.length ? notInArray(partnerLifecycles.partnerId, seen) : undefined,
      ))
      .orderBy(asc(partnerLifecycles.since))
      .limit(ADVANCE_BATCH));
    if (!due.length) break;
    for (const { partnerId } of due) {
      seen.push(partnerId);
      try {
        const result = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await advancePartnerInTransaction(tx, partnerId, { kind: "clock", at: now }));
        if (result.moved) moved += 1;
      } catch (error) {
        failures.push({ partnerId, error });
      }
    }
  }
  const { deleted, waiting } = await deleteDueBusinesses(context, failures);
  if (failures.length) throw new PartnerLifecycleError(failures);
  return { moved, deleted, waiting };
}
