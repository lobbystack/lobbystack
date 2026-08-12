import { asc, eq } from "drizzle-orm";

import { enqueueOutbox, withBusinessTransaction } from "@lobbystack/db";
import { agentRules, businessHours, closures, phoneNumbers, receptionistProfiles, services, staff, staffServiceAssignments } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

export async function listCatalog(
  context: DomainContext,
  input: { userId: string; businessId: string },
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const [staffRows, serviceRows, hoursRows, closureRows, numberRows, profileRows, ruleRows] = await Promise.all([
      tx.select().from(staff).where(eq(staff.businessId, input.businessId)).orderBy(asc(staff.name)),
      tx.select().from(services).where(eq(services.businessId, input.businessId)).orderBy(asc(services.name)),
      tx.select().from(businessHours).where(eq(businessHours.businessId, input.businessId)).orderBy(asc(businessHours.dayOfWeek)),
      tx.select().from(closures).where(eq(closures.businessId, input.businessId)).orderBy(asc(closures.startsAt)),
      tx.select().from(phoneNumbers).where(eq(phoneNumbers.businessId, input.businessId)).orderBy(asc(phoneNumbers.e164)),
      tx.select().from(receptionistProfiles).where(eq(receptionistProfiles.businessId, input.businessId)).limit(1),
      tx.select().from(agentRules).where(eq(agentRules.businessId, input.businessId)).orderBy(asc(agentRules.sortOrder)),
    ]);
    return { staff: staffRows, services: serviceRows, hours: hoursRows, closures: closureRows, phoneNumbers: numberRows, receptionistProfile: profileRows[0] ?? null, rules: ruleRows };
  });
}

export async function createService(
  context: DomainContext,
  input: { userId: string; businessId: string; name: string; slug: string; durationMinutes: number; description?: string },
): Promise<string> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [service] = await tx.insert(services).values({
      businessId: input.businessId,
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      durationMinutes: input.durationMinutes,
      description: input.description,
    }).returning({ id: services.id });
    if (!service) {
      throw new Error("Service could not be created.");
    }
    await enqueueOutbox(tx, {
      topic: "snapshot.refresh",
      businessId: input.businessId,
      aggregateType: "service",
      aggregateId: service.id,
      dedupeKey: `service:${service.id}:snapshot:${Date.now()}`,
      payload: { businessId: input.businessId, reason: "service_created" },
    });
    return service.id;
  });
}

export async function assignStaffToService(
  context: DomainContext,
  input: { userId: string; businessId: string; staffId: string; serviceId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await tx.insert(staffServiceAssignments).values(input).onConflictDoNothing();
    await enqueueOutbox(tx, {
      topic: "snapshot.refresh",
      businessId: input.businessId,
      aggregateType: "staff_service_assignment",
      aggregateId: input.staffId,
      dedupeKey: `assignment:${input.staffId}:${input.serviceId}:${Date.now()}`,
      payload: { businessId: input.businessId, reason: "assignment_updated" },
    });
  });
}

export async function saveHours(
  context: DomainContext,
  input: { userId: string; businessId: string; dayOfWeek: number; openMinutes: number; closeMinutes: number },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await tx.insert(businessHours).values(input).onConflictDoUpdate({
      target: [businessHours.businessId, businessHours.dayOfWeek],
      set: { openMinutes: input.openMinutes, closeMinutes: input.closeMinutes, updatedAt: new Date() },
    });
    await enqueueOutbox(tx, {
      topic: "snapshot.refresh",
      businessId: input.businessId,
      aggregateType: "business_hours",
      dedupeKey: `hours:${input.businessId}:${input.dayOfWeek}:${Date.now()}`,
      payload: { businessId: input.businessId, reason: "hours_updated" },
    });
  });
}
