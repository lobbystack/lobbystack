import { and, asc, eq } from "drizzle-orm";

import { businesses, enqueueOutbox, services, staff, staffServiceAssignments, withBusinessTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

function staffError(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

function cleanStaffName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw staffError("Staff name must be between 1 and 120 characters.", 400, "staff_name_invalid");
  return name;
}

export type StaffMember = { id: string; name: string; active: boolean; serviceIds: string[] };

/** The team, with the services each member offers. */
export async function listStaff(context: DomainContext, input: { userId: string; businessId: string }): Promise<StaffMember[]> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const [members, assignments] = await Promise.all([
      tx.select({ id: staff.id, name: staff.name, active: staff.active }).from(staff).where(eq(staff.businessId, input.businessId)).orderBy(asc(staff.createdAt)),
      tx.select({ staffId: staffServiceAssignments.staffId, serviceId: staffServiceAssignments.serviceId }).from(staffServiceAssignments).where(eq(staffServiceAssignments.businessId, input.businessId)),
    ]);
    return members.map((member) => ({ ...member, serviceIds: assignments.filter((row) => row.staffId === member.id).map((row) => row.serviceId) }));
  });
}

/** Adds a team member. They offer every active service until the owner changes it. */
export async function createStaffMember(context: DomainContext, input: { userId: string; businessId: string; name: string }): Promise<string> {
  const name = cleanStaffName(input.name);
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business) throw staffError("Business not found.", 404, "business_not_found");
    const [member] = await tx.insert(staff).values({ businessId: input.businessId, name, timezone: business.timezone }).returning({ id: staff.id });
    if (!member) throw new Error("Staff member could not be created.");
    const active = await tx.select({ id: services.id }).from(services).where(and(eq(services.businessId, input.businessId), eq(services.active, true)));
    if (active.length) await tx.insert(staffServiceAssignments).values(active.map((service) => ({ businessId: input.businessId, staffId: member.id, serviceId: service.id }))).onConflictDoNothing();
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "staff", aggregateId: member.id, dedupeKey: `staff:${member.id}:created`, payload: { businessId: input.businessId, reason: "staff_created" } });
    return member.id;
  });
}

/**
 * Renames a team member or turns them off. The last active member stays on,
 * because every appointment needs someone to book with.
 */
export async function updateStaffMember(context: DomainContext, input: { userId: string; businessId: string; staffId: string; name?: string; active?: boolean }): Promise<void> {
  const name = input.name === undefined ? undefined : cleanStaffName(input.name);
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (input.active === false) {
      const active = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, input.businessId), eq(staff.active, true)));
      if (!active.some((member) => member.id !== input.staffId)) throw staffError("Keep at least one active staff member so booking keeps working.", 409, "staff_last_active");
    }
    const [member] = await tx.update(staff).set({ ...(name !== undefined ? { name } : {}), ...(input.active !== undefined ? { active: input.active } : {}), updatedAt: new Date() }).where(and(eq(staff.id, input.staffId), eq(staff.businessId, input.businessId))).returning({ id: staff.id });
    if (!member) throw staffError("Staff member not found.", 404, "staff_not_found");
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "staff", aggregateId: member.id, dedupeKey: `staff:${member.id}:updated:${Date.now()}`, payload: { businessId: input.businessId, reason: "staff_updated" } });
  });
}
