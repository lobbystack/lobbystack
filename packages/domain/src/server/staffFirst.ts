import { and, eq, inArray, sql } from "drizzle-orm";

import { calls, contacts, enqueueOutbox, numberTrials, phoneNumbers, receptionistProfiles, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { CARRIERS_WITH_STAFF_FIRST, type CarrierId } from "@lobbystack/providers/telephony/types";
import { includesStaffFirst, isTransferPhone, shouldRingStaffFirst, type RuntimeLocale, type StaffFirstMode } from "@lobbystack/shared";

import { reserveOutboundCallAttempt } from "./billing";
import type { DomainContext } from "./context";
import { loadEntitlement } from "./entitlement";
import { enqueueNumberRouting, trialTransferNumberInTransaction } from "./numberTrials";
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

/** The rules a change to the mode or the staff phone must pass, on top of assertTransferNumberAllowed. */
export async function assertStaffFirstChange(tx: DatabaseTransaction, input: { businessId: string; mode?: StaffFirstMode | undefined; number?: string | null | undefined }): Promise<void> {
  const current = (await tx.select({ mode: receptionistProfiles.staffFirstMode, number: receptionistProfiles.staffFirstNumber }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, input.businessId)).limit(1))[0];
  const mode = input.mode ?? current?.mode ?? "never";
  const number = input.number !== undefined ? input.number : current?.number;
  if (mode !== "never" && !number) throw Object.assign(new Error("Add the staff phone to ring first."), { status: 400, code: "staff_first_number_required" });
  if (input.number) {
    // Ringing the number the call came in on would loop.
    const own = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.e164, input.number), inArray(phoneNumbers.status, ["active", "provisioning"]))).limit(1);
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
 * webhook doesn't use another, and with none left the receptionist answers.
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
  // A staff line that forwards here, or the dialled number itself, would loop.
  if (policy.number === input.e164 || policy.number === input.forwardedFrom) return { action: "receptionist", locale };
  // The last check before a number is dialed, as on a transfer: a trial can start after the staff phone was saved.
  if (!isTransferPhone(policy.number) || (trialPhone && policy.number !== trialPhone)) return { action: "receptionist", locale };
  const attempt = await reserveOutboundCallAttempt(context, { businessId: input.businessId, sourceKey: `staff_ring:${input.providerCallId}` });
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
 * uses no plan minutes and no conversation: the receptionist wasn't on it. It
 * stays out of mediaStartedAt so it doesn't count as the receptionist's first
 * call. A repeated webhook finds the record and changes nothing.
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
  });
}
