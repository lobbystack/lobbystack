import { and, eq, inArray } from "drizzle-orm";

import { contacts, numberTrials, phoneNumbers, receptionistProfiles, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { CARRIERS_WITH_STAFF_FIRST, type CarrierId } from "@lobbystack/providers/telephony/types";
import { includesStaffFirst, shouldRingStaffFirst, type RuntimeLocale, type StaffFirstMode } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { loadEntitlement } from "./entitlement";
import { enqueueNumberRouting } from "./numberTrials";
import { getCachedBusinessSnapshot } from "./snapshotCache";

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

export type StaffFirstDecision =
  // A blocked caller, or a number whose trial ended.
  | { action: "reject" }
  | { action: "receptionist"; locale: RuntimeLocale }
  | { action: "ring"; locale: RuntimeLocale; phone: string; ringSeconds: number; message?: string | undefined };

/**
 * What to do with a call to a staff-first number. Everything that can't ring
 * goes straight to the receptionist, which applies the plan's and the trial's
 * minutes as on any other call. Hours come from the snapshot, like the rest of
 * a call's setup, so a change reaches calls when the snapshot refreshes.
 */
export async function decideStaffFirstCall(context: DomainContext, input: { businessId: string; e164: string; from?: string | undefined; forwardedFrom?: string | undefined; now?: Date }): Promise<StaffFirstDecision> {
  const snapshot = await getCachedBusinessSnapshot(context, { businessId: input.businessId });
  const { ended, blocked, included } = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const trial = (await tx.select({ id: numberTrials.id }).from(numberTrials).where(and(eq(numberTrials.businessId, input.businessId), eq(numberTrials.status, "ended"))).limit(1))[0];
    const caller = input.from ? (await tx.select({ blockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.from))).limit(1))[0] : undefined;
    return { ended: Boolean(trial), blocked: Boolean(caller?.blockedAt), included: includesStaffFirst(await loadEntitlement(tx, input.businessId)) };
  });
  if (ended || blocked) return { action: "reject" };
  const locale = snapshot?.defaultLocale ?? "en";
  const policy = snapshot?.staffFirstPolicy;
  if (!snapshot || !policy || !included || !shouldRingStaffFirst(snapshot, input.now)) return { action: "receptionist", locale };
  // A staff line that forwards here, or the dialled number itself, would loop.
  if (policy.number === input.e164 || policy.number === input.forwardedFrom) return { action: "receptionist", locale };
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
