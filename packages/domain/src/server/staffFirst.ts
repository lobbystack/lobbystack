import { createHash } from "node:crypto";

import { and, eq, gt, inArray, like, ne, sql } from "drizzle-orm";

import { billingUsageEvents, calls, contacts, enqueueOutbox, numberTrials, phoneNumbers, receptionistProfiles, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { CARRIERS_WITH_STAFF_FIRST, type CarrierId } from "@lobbystack/providers/telephony/types";
import { includesStaffFirst, isTransferPhone, shouldRingStaffFirst, type RuntimeLocale, type StaffFirstMode } from "@lobbystack/shared";

import { reserveOutboundCallAttempt } from "./billing";
import type { DomainContext } from "./context";
import { loadEntitlement } from "./entitlement";
import { assertTransferNumberAllowed, enqueueNumberRouting, trialTransferNumberInTransaction } from "./numberTrials";
import { emitWebhookEventInTransaction } from "./publicApi/webhooks";
import { getCachedBusinessSnapshot } from "./snapshotCache";
import { findOrCreateCallContactInTransaction } from "./voice";

// Staff answers first: a call rings one staff phone before the receptionist
// answers. See docs/specs/staff-answers-first.md.

/** Why a business can't turn staff answers first on, or null when it can. A business with no number yet can: the setting applies to the number it buys. */
export type StaffFirstBlock = "plan" | "carrier" | null;

export async function staffFirstBlockInTransaction(tx: DatabaseTransaction, businessId: string): Promise<StaffFirstBlock> {
  if (!includesStaffFirst(await loadEntitlement(tx, businessId))) return "plan";
  const numbers = await tx.select({ carrier: phoneNumbers.carrier }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active")));
  return numbers.length && !numbers.some((number) => CARRIERS_WITH_STAFF_FIRST.includes(number.carrier as CarrierId)) ? "carrier" : null;
}

/** The rules a change to the mode or the staff phone must pass. The phone follows the same rules as a transfer number. */
export async function assertStaffFirstChange(tx: DatabaseTransaction, input: { businessId: string; mode?: StaffFirstMode | undefined; number?: string | null | undefined }): Promise<void> {
  const current = (await tx.select({ mode: receptionistProfiles.staffFirstMode, number: receptionistProfiles.staffFirstNumber }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, input.businessId)).limit(1))[0];
  const mode = input.mode ?? current?.mode ?? "never";
  const number = input.number !== undefined ? input.number : current?.number;
  if (mode !== "never" && !number) throw Object.assign(new Error("Add the staff phone to ring first."), { status: 400, code: "staff_first_number_required" });
  // Nothing dials the phone once it's off, so a rule like the trial's lock can't stop someone turning it off. Turning it back on checks the phone it would ring.
  const turningOn = mode !== "never" && (current?.mode ?? "never") === "never";
  const phone = input.mode === "never" ? undefined : input.number || (turningOn ? number : undefined);
  if (phone) {
    await assertTransferNumberAllowed(tx, { businessId: input.businessId, phone });
    // Ringing the number the call came in on would loop.
    const own = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.e164, phone), inArray(phoneNumbers.status, ["active", "provisioning"]))).limit(1);
    if (own.length) throw Object.assign(new Error("The staff phone can't be your LobbyStack number."), { status: 400, code: "staff_first_number_own_line" });
  }
  if (input.mode === undefined || input.mode === "never") return;
  const block = await staffFirstBlockInTransaction(tx, input.businessId);
  if (block === "plan") throw Object.assign(new Error("Staff answers first needs a paid plan."), { status: 402, code: "staff_first_plan_required" });
  if (block === "carrier") throw Object.assign(new Error("Staff answers first isn't available on this number yet."), { status: 409, code: "staff_first_carrier_unsupported" });
}

/** Saving the mode moves the business's numbers on or off the staff-first webhook. desiredNumberRouting decides where each one goes. */
export async function enqueueStaffFirstRouting(tx: DatabaseTransaction, businessId: string): Promise<void> {
  const numbers = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), inArray(phoneNumbers.carrier, [...CARRIERS_WITH_STAFF_FIRST])));
  for (const number of numbers) await enqueueNumberRouting(tx, { businessId, phoneNumberId: number.id, mode: "receptionist" });
}

/** A call a staff member took: GPT-Live never saw it, so its carrier's call ID keys the record. */
export const STAFF_ANSWERED_CALL_PROVIDER = "staff_answered";
export const STAFF_ANSWERED_DISPOSITION = "answered_by_team";

/** How long after a ring starts a second call from the caller counts as the same call: the ring, Twilio's buffer, and the carrier's forward. */
const RING_SETTLE_SECONDS = 15;

/** Bridged minutes a business gets in any 24 hours, whatever pays for it. Past this, calls go straight to the receptionist, so a staff phone can't carry unmetered traffic. */
export const STAFF_BRIDGED_MINUTES_PER_DAY = 600;

const DAY_MS = 24 * 60 * 60_000;

/** Ties a ring's attempt to its caller, without a phone number in billing data. */
function callerKey(businessId: string, from: string): string {
  return createHash("sha256").update(`${businessId}:${from}`).digest("hex").slice(0, 16);
}

/**
 * The guard for a forward that names no line: a carrier can leave out
 * ForwardedFrom, and a staff phone that forwards here would ring itself until
 * the first <Dial> times out, using an attempt each time. The same caller
 * arriving during their own ring is that forward, so the receptionist takes
 * it. A caller who hangs up and redials in that time reaches the receptionist
 * too. A withheld number can't be matched, so the first <Dial>'s timeout is
 * the only limit there.
 */
async function callerIsRinging(context: DomainContext, input: { businessId: string; caller: string; sourceKey: string; ringSeconds: number; now: Date }): Promise<boolean> {
  const since = new Date(input.now.getTime() - (input.ringSeconds + RING_SETTLE_SECONDS) * 1_000);
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rings = await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, input.businessId), like(billingUsageEvents.sourceKey, `staff_ring:${input.caller}:%`), ne(billingUsageEvents.sourceKey, input.sourceKey), gt(billingUsageEvents.createdAt, since))).limit(1);
    return rings.length > 0;
  });
}

/** Whether the business used up its bridged minutes. Calls count once they end, so calls in progress can pass the cap by up to their own length. */
async function bridgedCapReached(context: DomainContext, input: { businessId: string; now: Date }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [bridged] = await tx.select({ seconds: sql<number>`coalesce(sum(${calls.providerDurationSeconds}), 0)`.mapWith(Number) }).from(calls).where(and(eq(calls.businessId, input.businessId), eq(calls.provider, STAFF_ANSWERED_CALL_PROVIDER), gt(calls.startedAt, new Date(input.now.getTime() - DAY_MS))));
    return (bridged?.seconds ?? 0) >= STAFF_BRIDGED_MINUTES_PER_DAY * 60;
  });
}

export type StaffFirstDecision =
  // A blocked caller, or a number whose trial ended.
  | { action: "reject" }
  | { action: "receptionist"; locale: RuntimeLocale }
  | { action: "ring"; locale: RuntimeLocale; phone: string; ringSeconds: number; message?: string | undefined };

/**
 * What to do with a call to a staff-first number. Everything that can't ring
 * goes straight to the receptionist, which applies the plan's and the trial's
 * minutes as on any other call. Hours come from the snapshot, like the rest of
 * a call's setup, so a change reaches calls when the snapshot refreshes. Each
 * ring uses one transfer attempt, keyed on the carrier's call so a repeated
 * webhook doesn't use another. With none left, or past the bridged minutes,
 * the receptionist answers.
 */
export async function decideStaffFirstCall(context: DomainContext, input: { businessId: string; e164: string; providerCallId: string; from?: string | undefined; forwardedFrom?: string | undefined; now?: Date }): Promise<StaffFirstDecision> {
  const snapshot = await getCachedBusinessSnapshot(context, { businessId: input.businessId });
  const { ended, blocked, included, trialPhone } = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const trial = (await tx.select({ id: numberTrials.id }).from(numberTrials).where(and(eq(numberTrials.businessId, input.businessId), eq(numberTrials.status, "ended"))).limit(1))[0];
    const caller = input.from ? (await tx.select({ blockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.from))).limit(1))[0] : undefined;
    return { ended: Boolean(trial), blocked: Boolean(caller?.blockedAt), included: includesStaffFirst(await loadEntitlement(tx, input.businessId)), trialPhone: await trialTransferNumberInTransaction(tx, input) };
  });
  if (ended || blocked) return { action: "reject" };
  const locale = snapshot?.defaultLocale ?? "en";
  const policy = snapshot?.staffFirstPolicy;
  if (!snapshot || !policy || !included || !shouldRingStaffFirst(snapshot, input.now)) return { action: "receptionist", locale };
  // A staff line that forwards here, or the dialled number itself, would loop. Some carriers put the forwarding line in From.
  if (policy.number === input.e164 || policy.number === input.forwardedFrom || policy.number === input.from) return { action: "receptionist", locale };
  // The last check before a number is dialed, as on a transfer: a trial can start after the staff phone was saved.
  if (!isTransferPhone(policy.number) || (trialPhone && policy.number !== trialPhone)) return { action: "receptionist", locale };
  const now = input.now ?? new Date();
  if (await bridgedCapReached(context, { businessId: input.businessId, now })) return { action: "receptionist", locale };
  const caller = input.from ? callerKey(input.businessId, input.from) : undefined;
  const sourceKey = caller ? `staff_ring:${caller}:${input.providerCallId}` : `staff_ring:${input.providerCallId}`;
  if (caller && await callerIsRinging(context, { businessId: input.businessId, caller, sourceKey, ringSeconds: policy.ringSeconds, now })) return { action: "receptionist", locale };
  const attempt = await reserveOutboundCallAttempt(context, { businessId: input.businessId, sourceKey, recordedAt: now });
  if (!attempt.allowed) return { action: "receptionist", locale };
  return { action: "ring", locale, phone: policy.number, ringSeconds: policy.ringSeconds, ...(policy.message ? { message: policy.message } : {}) };
}

/** What the staff leg reads out. The team's language decides it, and a caller's saved name beats their number. */
export async function loadStaffPrompt(context: DomainContext, input: { businessId: string; from?: string | undefined }): Promise<{ business: string; locale: RuntimeLocale; caller: { name?: string | null; phone?: string } }> {
  const snapshot = await getCachedBusinessSnapshot(context, { businessId: input.businessId });
  const contact = input.from ? await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => (await tx.select({ name: contacts.name }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.from!))).limit(1))[0]) : undefined;
  return { business: snapshot?.displayName ?? "", locale: snapshot?.teamLocale ?? snapshot?.defaultLocale ?? "en", caller: { ...(contact?.name ? { name: contact.name } : {}), ...(input.from ? { phone: input.from } : {}) } };
}

/** What the receptionist's leg needs after a ring: the business's language and the handover message. */
export async function loadStaffFirstHandover(context: DomainContext, input: { businessId: string }): Promise<{ locale: RuntimeLocale; message?: string }> {
  const snapshot = await getCachedBusinessSnapshot(context, { businessId: input.businessId });
  return { locale: snapshot?.defaultLocale ?? "en", ...(snapshot?.staffFirstPolicy?.handoverMessage ? { message: snapshot.staffFirstPolicy.handoverMessage } : {}) };
}

/**
 * Records a call a staff member took, once the carrier reports it over. It
 * uses no plan minutes and no conversation: the receptionist wasn't on it. Its
 * seconds count toward STAFF_BRIDGED_MINUTES_PER_DAY. It stays out of
 * mediaStartedAt so it doesn't count as the receptionist's first call. A
 * repeated webhook finds the record and changes nothing.
 */
export async function recordStaffAnsweredCall(context: DomainContext, input: { businessId: string; providerCallId: string; from?: string | undefined; to: string; seconds: number; endedAt?: Date }): Promise<void> {
  const endedAt = input.endedAt ?? new Date();
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const existing = await tx.select({ id: calls.id }).from(calls).where(and(eq(calls.provider, STAFF_ANSWERED_CALL_PROVIDER), eq(calls.providerCallId, input.providerCallId))).limit(1);
    if (existing.length) return;
    const { contactId } = await findOrCreateCallContactInTransaction(tx, { businessId: input.businessId, from: input.from });
    const [call] = await tx.insert(calls).values({
      businessId: input.businessId,
      contactId,
      provider: STAFF_ANSWERED_CALL_PROVIDER,
      providerCallId: input.providerCallId,
      transport: "voice",
      carrier: sql<string>`coalesce((select carrier from public.phone_numbers where business_id = ${input.businessId}::uuid and e164 = ${input.to} and status <> 'reclaimed' limit 1), 'twilio')`,
      status: "completed",
      disposition: STAFF_ANSWERED_DISPOSITION,
      billingExcluded: true,
      startedAt: new Date(endedAt.getTime() - input.seconds * 1_000),
      endedAt,
      providerDurationSeconds: input.seconds,
    }).onConflictDoNothing().returning({ id: calls.id, revision: calls.revision });
    if (!call) return;
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "call", aggregateId: call.id, dedupeKey: `call:${call.id}:completed:${call.revision}`, payload: { type: "call.completed", entityId: call.id, revision: call.revision } });
    await enqueueOutbox(tx, { topic: "call.syncPrice", businessId: input.businessId, aggregateType: "call", aggregateId: call.id, dedupeKey: `call:${call.id}:staff-price`, payload: { providerCallId: input.providerCallId, providerCallStatus: "completed" } });
    // Other calls fire this once their conversation closes. This one has no conversation, and only the insert above reaches here.
    await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "call.completed", resourceId: call.id });
  });
}
