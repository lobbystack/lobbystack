import { and, eq } from "drizzle-orm";

import { complianceRecords, enqueueOutbox, phoneNumbers, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";

export async function saveComplianceRecord(
  context: DomainContext,
  input: { userId: string; businessId: string; kind: string; status: string; providerReference?: string; details?: Record<string, unknown> },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [record] = await tx.insert(complianceRecords).values({
      businessId: input.businessId,
      kind: input.kind,
      status: input.status,
      ...(input.providerReference !== undefined ? { providerReference: input.providerReference } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
    }).onConflictDoUpdate({ target: [complianceRecords.businessId, complianceRecords.kind], set: { status: input.status, ...(input.providerReference !== undefined ? { providerReference: input.providerReference } : {}), ...(input.details !== undefined ? { details: input.details } : {}), updatedAt: new Date() } }).returning({ id: complianceRecords.id });
    if (!record) {
      throw new Error("Compliance record could not be saved.");
    }
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "compliance_record", aggregateId: record.id, dedupeKey: `compliance:${record.id}:${input.status}:${Date.now()}`, payload: { type: "knowledge.progressed", entityId: record.id } });
    return record.id;
  });
}

export async function schedulePhoneNumberRelease(context: DomainContext, input: { userId: string; businessId: string; phoneNumberId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const number = (await tx.update(phoneNumbers).set({ reclaimScheduledAt: new Date(), updatedAt: new Date() }).where(and(eq(phoneNumbers.id, input.phoneNumberId), eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"))).returning({ id: phoneNumbers.id }))[0];
    if (!number) throw new Error("Active phone number not found.");
    await enqueueOutbox(tx, { topic: "phoneNumber.reclaim", businessId: input.businessId, aggregateType: "phone_number", aggregateId: number.id, dedupeKey: `phone-number:${number.id}:reclaim`, payload: { phoneNumberId: number.id } });
  });
}
