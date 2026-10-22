import { and, eq, inArray } from "drizzle-orm";

import { enqueueOutbox, onboardingNumberClaimEvents, phoneNumbers, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";
import { expireAbandonedNumberClaimsInTransaction, lockBusinessNumberClaims } from "./phoneNumbers";

export type PhoneNumberReleaseOutcome = "scheduled" | "not_active" | "being_replaced";
export const NUMBER_BEING_REPLACED_MESSAGE = "This number's replacement is still being set up. Release it once the new number is live.";

/**
 * Schedules an active number's release for now and queues it. A number whose
 * replacement is still being bought stays: releasing it would make the
 * replacement fail and leave the business with no number. Claims take the same
 * lock, so no replacement can start between the check and the release.
 */
export async function schedulePhoneNumberReleaseInTransaction(tx: DatabaseTransaction, input: { businessId: string; phoneNumberId: string }): Promise<PhoneNumberReleaseOutcome> {
  await lockBusinessNumberClaims(tx, input.businessId);
  // An abandoned replacement fails here, so a worker that takes it up late can't buy a number after this one is gone.
  await expireAbandonedNumberClaimsInTransaction(tx, input.businessId);
  const claims = onboardingNumberClaimEvents;
  const [replacement] = await tx.select({ id: claims.id }).from(claims).where(and(eq(claims.businessId, input.businessId), eq(claims.replacingPhoneNumberId, input.phoneNumberId), inArray(claims.status, ["reserved", "provisioning"]))).limit(1);
  if (replacement) return "being_replaced";
  const number = (await tx.update(phoneNumbers).set({ reclaimScheduledAt: new Date(), updatedAt: new Date() }).where(and(eq(phoneNumbers.id, input.phoneNumberId), eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"))).returning({ id: phoneNumbers.id }))[0];
  if (!number) return "not_active";
  await enqueueOutbox(tx, { topic: "phoneNumber.reclaim", businessId: input.businessId, aggregateType: "phone_number", aggregateId: number.id, dedupeKey: `phone-number:${number.id}:reclaim`, payload: { phoneNumberId: number.id } });
  return "scheduled";
}

export async function schedulePhoneNumberRelease(context: DomainContext, input: { userId: string; businessId: string; phoneNumberId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const outcome = await schedulePhoneNumberReleaseInTransaction(tx, input);
    if (outcome === "being_replaced") throw Object.assign(new Error(NUMBER_BEING_REPLACED_MESSAGE), { status: 409 });
    if (outcome === "not_active") throw new Error("Active phone number not found.");
  });
}
