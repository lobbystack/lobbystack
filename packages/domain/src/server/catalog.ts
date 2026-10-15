import { and, asc, count, eq, ilike, inArray, isNull } from "drizzle-orm";

import { enqueueOutbox, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { agentRules, businesses, businessHours, closures, phoneNumbers, receptionistProfiles, services, staff, staffServiceAssignments } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import { servicePriceTypes, type ServicePriceType } from "@lobbystack/shared";
import { normalizeClosures, normalizeHoursWindows, sameHoursWindows } from "../hours";
import { writeBusinessHoursInTransaction } from "./businessHours";
import type { DomainContext } from "./context";

export async function listCatalog(
  context: DomainContext,
  input: { userId: string; businessId: string; search?: string; limit?: number; offset?: number },
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const [staffRows, serviceRows, hoursRows, closureRows, numberRows, profileRows, ruleRows] = await Promise.all([
      tx.select().from(staff).where(eq(staff.businessId, input.businessId)).orderBy(asc(staff.name)),
      tx.select().from(services).where(and(eq(services.businessId, input.businessId), isNull(services.deletedAt), ...(input.search?.trim() ? [ilike(services.name, `%${input.search.trim()}%`)] : []))).orderBy(asc(services.name)).limit(Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 100) + 1).offset(Math.max(Math.trunc(input.offset ?? 0), 0)),
      tx.select().from(businessHours).where(and(eq(businessHours.businessId, input.businessId), isNull(businessHours.staffId))).orderBy(asc(businessHours.dayOfWeek), asc(businessHours.openMinutes)),
      tx.select().from(closures).where(and(eq(closures.businessId, input.businessId), isNull(closures.staffId))).orderBy(asc(closures.startsAt)),
      tx.select().from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"))).orderBy(asc(phoneNumbers.e164)),
      tx.select().from(receptionistProfiles).where(eq(receptionistProfiles.businessId, input.businessId)).limit(1),
      tx.select().from(agentRules).where(eq(agentRules.businessId, input.businessId)).orderBy(asc(agentRules.sortOrder)),
    ]);
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 100);
    const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
    const [total] = await tx.select({ count: count() }).from(services).where(and(eq(services.businessId, input.businessId), isNull(services.deletedAt), ...(input.search?.trim() ? [ilike(services.name, `%${input.search.trim()}%`)] : [])));
    const [business] = await tx.select({ currency: businesses.currency }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    const page = serviceRows.slice(0, limit);
    const serviceIds = page.map((service) => service.id);
    const assignments = serviceIds.length ? await tx.select({ serviceId: staffServiceAssignments.serviceId, staffId: staffServiceAssignments.staffId }).from(staffServiceAssignments).where(and(eq(staffServiceAssignments.businessId, input.businessId), inArray(staffServiceAssignments.serviceId, serviceIds))) : [];
    return { currency: business?.currency ?? "USD", staff: staffRows, services: page.map((service) => ({ ...service, assignedStaffIds: assignments.filter((assignment) => assignment.serviceId === service.id).map((assignment) => assignment.staffId) })), servicesPagination: { limit, offset, total: Number(total?.count ?? 0), hasNext: serviceRows.length > limit }, hours: hoursRows, closures: closureRows, phoneNumbers: numberRows, receptionistProfile: profileRows[0] ?? null, rules: ruleRows };
  });
}

/**
 * The rules a service's fields follow, on create and on update: a name and a
 * slug of up to 160 characters, a whole number of minutes up to a day, a
 * description of up to 2,000 characters, and a price: its type, and amounts
 * that are whole, non-negative numbers of the currency's smallest unit (null
 * clears them). A range's upper bound must be above its lower one. Fields left
 * out aren't checked.
 */
function assertServiceFields(input: { name?: string | undefined; slug?: string | undefined; durationMinutes?: number | undefined; description?: string | null | undefined; active?: boolean | undefined; priceType?: ServicePriceType | undefined; priceMinor?: number | null | undefined; priceMaxMinor?: number | null | undefined }): void {
  const invalid = (field: string) => Object.assign(new Error(`${field} is invalid.`), { status: 400 });
  const text = (value: unknown, maxLength: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
  const amount = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000;
  if (input.name !== undefined && !text(input.name, 160)) throw invalid("name");
  if (input.slug !== undefined && !text(input.slug, 160)) throw invalid("slug");
  if (input.durationMinutes !== undefined && !(Number.isInteger(input.durationMinutes) && input.durationMinutes >= 1 && input.durationMinutes <= 1_440)) throw invalid("durationMinutes");
  if (input.description != null && !text(input.description, 2_000)) throw invalid("description");
  if (input.active !== undefined && typeof input.active !== "boolean") throw invalid("active");
  if (input.priceType !== undefined && !(servicePriceTypes as readonly unknown[]).includes(input.priceType)) throw invalid("priceType");
  if (input.priceMinor != null && !amount(input.priceMinor)) throw invalid("priceMinor");
  if (input.priceMaxMinor != null && !(amount(input.priceMaxMinor) && (input.priceMinor == null || input.priceMaxMinor > input.priceMinor))) throw invalid("priceMaxMinor");
}

// Only a range keeps an upper bound, and a price set in person keeps no amount.
function priceColumns(input: { priceType?: ServicePriceType | undefined; priceMinor?: number | null | undefined; priceMaxMinor?: number | null | undefined }) {
  if (input.priceType === undefined) return {};
  return {
    priceType: input.priceType,
    priceMinor: input.priceType === "in_person" ? null : input.priceMinor ?? null,
    priceMaxMinor: input.priceType === "range" ? input.priceMaxMinor ?? null : null,
  };
}

export async function createService(
  context: DomainContext,
  input: { userId: string; businessId: string; name: string; slug: string; durationMinutes: number; description?: string; active?: boolean; priceType?: ServicePriceType; priceMinor?: number | null; priceMaxMinor?: number | null },
): Promise<string> {
  assertServiceFields(input);
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [service] = await tx.insert(services).values({
      businessId: input.businessId,
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      durationMinutes: input.durationMinutes,
      description: input.description?.trim(),
      ...priceColumns({ ...input, priceType: input.priceType ?? "fixed" }),
      active: input.active ?? true,
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

export async function updateService(
  context: DomainContext,
  input: { userId: string; businessId: string; serviceId: string; name?: string; slug?: string; durationMinutes?: number; description?: string | null; active?: boolean; priceType?: ServicePriceType; priceMinor?: number | null; priceMaxMinor?: number | null },
): Promise<void> {
  assertServiceFields(input);
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [service] = await tx.update(services).set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.slug !== undefined ? { slug: input.slug.trim().toLowerCase() } : {}),
      durationMinutes: input.durationMinutes,
      description: typeof input.description === "string" ? input.description.trim() : input.description,
      ...priceColumns(input),
      active: input.active,
      updatedAt: new Date(),
    }).where(and(eq(services.id, input.serviceId), eq(services.businessId, input.businessId), isNull(services.deletedAt))).returning({ id: services.id });
    if (!service) throw Object.assign(new Error("Service not found."), { status: 404 });
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "service", aggregateId: service.id, dedupeKey: `service:${service.id}:snapshot:${Date.now()}`, payload: { businessId: input.businessId, reason: "service_updated" } });
  });
}

/**
 * Deletes a service from the catalog. Appointments still reference it for
 * history, so the row stays, inactive and marked deleted, and its slug is
 * free for a new service.
 */
export async function deleteService(
  context: DomainContext,
  input: { userId: string; businessId: string; serviceId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const now = new Date();
    const [service] = await tx.update(services).set({ active: false, deletedAt: now, updatedAt: now }).where(and(eq(services.id, input.serviceId), eq(services.businessId, input.businessId), isNull(services.deletedAt))).returning({ id: services.id });
    if (!service) throw Object.assign(new Error("Service not found."), { status: 404 });
    await tx.delete(staffServiceAssignments).where(and(eq(staffServiceAssignments.businessId, input.businessId), eq(staffServiceAssignments.serviceId, service.id)));
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "service", aggregateId: service.id, dedupeKey: `service:${service.id}:snapshot:${Date.now()}`, payload: { businessId: input.businessId, reason: "service_deleted" } });
  });
}

export async function assignStaffToService(
  context: DomainContext,
  input: { userId: string; businessId: string; staffId: string; serviceId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [service] = await tx.select({ id: services.id }).from(services).where(and(eq(services.id, input.serviceId), eq(services.businessId, input.businessId), isNull(services.deletedAt))).limit(1);
    if (!service) throw Object.assign(new Error("Service not found."), { status: 404 });
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

export async function unassignStaffFromService(
  context: DomainContext,
  input: { userId: string; businessId: string; staffId: string; serviceId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await tx.delete(staffServiceAssignments).where(and(eq(staffServiceAssignments.businessId, input.businessId), eq(staffServiceAssignments.staffId, input.staffId), eq(staffServiceAssignments.serviceId, input.serviceId)));
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "staff_service_assignment", aggregateId: input.staffId, dedupeKey: `assignment:${input.staffId}:${input.serviceId}:${Date.now()}`, payload: { businessId: input.businessId, reason: "assignment_updated" } });
  });
}

/**
 * Replaces the weekly hours a person set, in the dashboard or the API: the
 * listed windows, other days closed. A day can have several windows. Marks
 * the hours as the operator's, so AI never replaces them, unless only the
 * closures changed. Refreshes the receptionist snapshot. Given closures
 * replace every closure, including ones that already ended; without them,
 * closures stay as they are. Callers authorize first.
 */
export async function replaceBusinessHoursInTransaction(
  tx: DatabaseTransaction,
  input: {
    businessId: string;
    hours: Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }>;
    /** Local times in the business's timezone, such as 2026-12-25T00:00. */
    closures?: Array<{ startsAt: string; endsAt: string; reason?: string | undefined }> | undefined;
  },
): Promise<void> {
  const hours = normalizeHoursWindows(input.hours);
  let closureRows: ReturnType<typeof normalizeClosures> | undefined;
  let sameHours = false;
  // Lock the business row before reading anything, so this write and the
  // worker's generated hours (which lock the same row) can't interleave.
  if (input.closures) {
    const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1).for("update");
    if (!business) throw Object.assign(new Error("Business not found."), { status: 404 });
    closureRows = normalizeClosures(input.closures, business.timezone, new Date());
    const current = await tx.select({ dayOfWeek: businessHours.dayOfWeek, openMinutes: businessHours.openMinutes, closeMinutes: businessHours.closeMinutes }).from(businessHours)
      .where(and(eq(businessHours.businessId, input.businessId), isNull(businessHours.staffId))).orderBy(asc(businessHours.dayOfWeek), asc(businessHours.openMinutes));
    sameHours = sameHoursWindows(hours, current);
  }
  // Saving only closures leaves the hours to whoever set them, so AI can still fill an empty week.
  await tx.update(businesses).set({ ...(sameHours ? {} : { hoursSource: "operator" as const }), updatedAt: new Date() }).where(eq(businesses.id, input.businessId));
  if (closureRows) {
    await tx.delete(closures).where(and(eq(closures.businessId, input.businessId), isNull(closures.staffId)));
    if (closureRows.length) await tx.insert(closures).values(closureRows.map((closure) => ({ businessId: input.businessId, ...closure })));
  }
  // Its snapshot refresh picks up the closures too.
  await writeBusinessHoursInTransaction(tx, { businessId: input.businessId, hours, reason: "hours_updated" });
}
