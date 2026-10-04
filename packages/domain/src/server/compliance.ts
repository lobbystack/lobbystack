import { and, eq } from "drizzle-orm";

import { enqueueOutbox, phoneNumbers, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";

export async function schedulePhoneNumberRelease(context: DomainContext, input: { userId: string; businessId: string; phoneNumberId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const number = (await tx.update(phoneNumbers).set({ reclaimScheduledAt: new Date(), updatedAt: new Date() }).where(and(eq(phoneNumbers.id, input.phoneNumberId), eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"))).returning({ id: phoneNumbers.id }))[0];
    if (!number) throw new Error("Active phone number not found.");
    await enqueueOutbox(tx, { topic: "phoneNumber.reclaim", businessId: input.businessId, aggregateType: "phone_number", aggregateId: number.id, dedupeKey: `phone-number:${number.id}:reclaim`, payload: { phoneNumberId: number.id } });
  });
}
