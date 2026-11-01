import { and, eq, inArray } from "drizzle-orm";

import { phoneNumbers, receptionistProfiles, type DatabaseTransaction } from "@lobbystack/db";
import { CARRIERS_WITH_STAFF_FIRST, type CarrierId } from "@lobbystack/providers/telephony/types";
import { includesStaffFirst, type StaffFirstMode } from "@lobbystack/shared";

import { loadEntitlement } from "./entitlement";
import { enqueueNumberRouting } from "./numberTrials";

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
