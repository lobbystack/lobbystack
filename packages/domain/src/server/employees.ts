import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";

import { businesses, enqueueOutbox, services, staff, staffServiceAssignments, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

// Employees are the staff members a business lists by name. Deleted ones stay as inactive staff for their past appointments.
const employeeColumns = { id: staff.id, name: staff.name, phone: staff.transferNumber, vacationStartsOn: staff.vacationStartsOn, vacationEndsOn: staff.vacationEndsOn, createdAt: staff.createdAt, updatedAt: staff.updatedAt };

/** Inclusive days, as YYYY-MM-DD in the business's timezone. */
export type EmployeeVacation = { startsOn: string; endsOn: string };

/** Working, on vacation today, or not bookable because they do no service. */
export type EmployeeStatus = "working" | "on_vacation" | "no_services";

/** The business's current date, YYYY-MM-DD. */
export function businessToday(timezone: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(timezone).toISODate()!;
}

/** A stored vacation that hasn't ended yet. */
export function currentVacation(row: { vacationStartsOn: string | null; vacationEndsOn: string | null }, today: string): EmployeeVacation | null {
  return row.vacationStartsOn && row.vacationEndsOn && row.vacationEndsOn >= today ? { startsOn: row.vacationStartsOn, endsOn: row.vacationEndsOn } : null;
}

export function isOnVacation(vacation: EmployeeVacation | null | undefined, day: string): boolean {
  return Boolean(vacation && vacation.startsOn <= day && day <= vacation.endsOn);
}

export function employeeStatus(input: { vacation: EmployeeVacation | null; serviceCount: number; today: string }): EmployeeStatus {
  if (isOnVacation(input.vacation, input.today)) return "on_vacation";
  return input.serviceCount ? "working" : "no_services";
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function requireVacation(vacation: EmployeeVacation | null): EmployeeVacation | null {
  if (!vacation) return null;
  const valid = [vacation.startsOn, vacation.endsOn].every((day) => ISO_DAY.test(day) && DateTime.fromISO(day).isValid) && vacation.startsOn <= vacation.endsOn;
  if (!valid) throw Object.assign(new Error("Choose the first and last day of the vacation."), { status: 400, code: "employee_vacation_invalid" });
  return vacation;
}

function activeEmployees(businessId: string, ...conditions: SQL[]) {
  return and(eq(staff.businessId, businessId), eq(staff.isEmployee, true), eq(staff.active, true), ...conditions);
}

async function refreshSnapshot(tx: DatabaseTransaction, businessId: string, employeeId: string, reason: string) {
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId, aggregateType: "employee", aggregateId: employeeId, dedupeKey: `employee:${employeeId}:snapshot:${Date.now()}`, payload: { businessId, reason } });
}

async function assertPhoneAvailable(tx: DatabaseTransaction, input: { businessId: string; phone: string | null; employeeId?: string }) {
  if (!input.phone) return;
  const duplicate = await tx.select({ id: staff.id }).from(staff).where(activeEmployees(input.businessId, eq(staff.transferNumber, input.phone), ...(input.employeeId ? [ne(staff.id, input.employeeId)] : []))).limit(1);
  if (duplicate.length) throw Object.assign(new Error("An employee with this phone number already exists."), { status: 409, code: "employee_phone_exists" });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The services an employee does: at least one, all of them the business's own. */
async function requireServiceIds(tx: DatabaseTransaction, businessId: string, serviceIds: string[]): Promise<string[]> {
  const ids = [...new Set(serviceIds)];
  if (!ids.length) throw Object.assign(new Error("Choose at least one service."), { status: 400, code: "employee_services_required" });
  const found = ids.every((id) => UUID.test(id))
    ? await tx.select({ id: services.id }).from(services).where(and(eq(services.businessId, businessId), isNull(services.deletedAt), inArray(services.id, ids)))
    : [];
  if (found.length !== ids.length) throw Object.assign(new Error("A chosen service no longer exists."), { status: 400, code: "employee_service_invalid" });
  return ids;
}

async function replaceServices(tx: DatabaseTransaction, businessId: string, staffId: string, serviceIds: string[]) {
  await tx.delete(staffServiceAssignments).where(and(eq(staffServiceAssignments.businessId, businessId), eq(staffServiceAssignments.staffId, staffId)));
  await tx.insert(staffServiceAssignments).values(serviceIds.map((serviceId) => ({ businessId, staffId, serviceId })));
}

function requireName(value: string): string {
  const name = value.trim();
  if (!name) throw Object.assign(new Error("Employee name is required."), { status: 400, code: "employee_name_required" });
  return name;
}

export async function listEmployees(
  context: DomainContext,
  input: { userId: string; businessId: string; search?: string; limit?: number; offset?: number },
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 100);
    const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
    const search = input.search?.trim();
    const filter = activeEmployees(input.businessId, ...(search ? [or(ilike(staff.name, `%${search}%`), ilike(staff.transferNumber, `%${search.replace(/[\s()-]/g, "")}%`))!] : []));
    const [rows, total, serviceRows, business] = await Promise.all([
      tx.select(employeeColumns)
        .from(staff).where(filter).orderBy(desc(staff.createdAt), asc(staff.id)).limit(limit + 1).offset(offset),
      tx.select({ count: count() }).from(staff).where(filter),
      tx.select({ id: services.id, name: services.name }).from(services).where(and(eq(services.businessId, input.businessId), isNull(services.deletedAt))).orderBy(asc(services.name), asc(services.id)),
      tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1),
    ]);
    const today = businessToday(business[0]?.timezone ?? "UTC");
    const page = rows.slice(0, limit);
    const assignments = page.length
      ? await tx.select({ staffId: staffServiceAssignments.staffId, serviceId: staffServiceAssignments.serviceId }).from(staffServiceAssignments).where(and(eq(staffServiceAssignments.businessId, input.businessId), inArray(staffServiceAssignments.staffId, page.map((row) => row.id))))
      : [];
    const order = new Map(serviceRows.map((service, index) => [service.id, index]));
    const employees = page.map(({ vacationStartsOn, vacationEndsOn, ...row }) => {
      const serviceIds = assignments.filter((assignment) => assignment.staffId === row.id && order.has(assignment.serviceId)).map((assignment) => assignment.serviceId).sort((left, right) => order.get(left)! - order.get(right)!);
      const vacation = currentVacation({ vacationStartsOn, vacationEndsOn }, today);
      return { ...row, serviceIds, vacation, status: employeeStatus({ vacation, serviceCount: serviceIds.length, today }) };
    });
    return { employees, services: serviceRows, today, pagination: { limit, offset, total: Number(total[0]?.count ?? 0), hasNext: rows.length > limit } };
  });
}

/** Adds an employee: a staff member bookings for their services can be assigned to. `phone` is E.164, or null when calls for them go to the business. */
export async function createEmployee(
  context: DomainContext,
  input: { userId: string; businessId: string; name: string; phone: string | null; serviceIds: string[]; vacation: EmployeeVacation | null },
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const name = requireName(input.name);
    const vacation = requireVacation(input.vacation);
    const serviceIds = await requireServiceIds(tx, input.businessId, input.serviceIds);
    await assertPhoneAvailable(tx, input);
    const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business) throw Object.assign(new Error("Business not found."), { status: 404 });
    const [employee] = await tx.insert(staff).values({ businessId: input.businessId, name, timezone: business.timezone, transferNumber: input.phone, isEmployee: true, vacationStartsOn: vacation?.startsOn ?? null, vacationEndsOn: vacation?.endsOn ?? null }).returning(employeeColumns);
    if (!employee) throw new Error("Employee could not be created.");
    await replaceServices(tx, input.businessId, employee.id, serviceIds);
    await refreshSnapshot(tx, input.businessId, employee.id, "employee_created");
    return { ...employee, serviceIds };
  });
}

export async function updateEmployee(
  context: DomainContext,
  input: { userId: string; businessId: string; employeeId: string; name: string; phone: string | null; serviceIds: string[]; vacation: EmployeeVacation | null },
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const name = requireName(input.name);
    const vacation = requireVacation(input.vacation);
    const serviceIds = await requireServiceIds(tx, input.businessId, input.serviceIds);
    await assertPhoneAvailable(tx, input);
    const [employee] = await tx.update(staff).set({ name, transferNumber: input.phone, vacationStartsOn: vacation?.startsOn ?? null, vacationEndsOn: vacation?.endsOn ?? null, updatedAt: new Date() })
      .where(activeEmployees(input.businessId, eq(staff.id, input.employeeId)))
      .returning(employeeColumns);
    if (!employee) return null;
    await replaceServices(tx, input.businessId, employee.id, serviceIds);
    await refreshSnapshot(tx, input.businessId, employee.id, "employee_updated");
    return { ...employee, serviceIds };
  });
}

/** Deactivates the employee's staff member rather than deleting it, so their appointments keep their assignee. */
export async function deleteEmployee(
  context: DomainContext,
  input: { userId: string; businessId: string; employeeId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [deleted] = await tx.update(staff).set({ active: false, updatedAt: new Date() }).where(activeEmployees(input.businessId, eq(staff.id, input.employeeId))).returning({ id: staff.id });
    if (!deleted) return false;
    await refreshSnapshot(tx, input.businessId, deleted.id, "employee_deleted");
    return true;
  });
}

/** The business's active employees, oldest first. */
export async function listBookableEmployees(tx: DatabaseTransaction, businessId: string) {
  return await tx.select({ name: staff.name, staffId: staff.id, phone: staff.transferNumber, vacationStartsOn: staff.vacationStartsOn, vacationEndsOn: staff.vacationEndsOn }).from(staff)
    .where(activeEmployees(businessId))
    .orderBy(asc(staff.createdAt), asc(staff.id));
}

/** Matches a name the caller gave to one employee: an exact match, else a single partial match, with the active services they do and any vacation that hasn't ended. */
export async function resolveEmployee(context: DomainContext, input: { businessId: string; name: string }) {
  const wanted = input.name.trim().toLowerCase();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await listBookableEmployees(tx, input.businessId);
    const exact = rows.filter((row) => row.name.trim().toLowerCase() === wanted);
    const matches = exact.length || !wanted ? exact : rows.filter((row) => row.name.toLowerCase().includes(wanted));
    if (matches.length !== 1) return { ok: false as const, employees: rows.map((row) => row.name) };
    const match = matches[0]!;
    const [assigned, business] = await Promise.all([
      tx.select({ name: services.name }).from(staffServiceAssignments)
        .innerJoin(services, eq(services.id, staffServiceAssignments.serviceId))
        .where(and(eq(staffServiceAssignments.businessId, input.businessId), eq(staffServiceAssignments.staffId, match.staffId), eq(services.active, true), isNull(services.deletedAt)))
        .orderBy(asc(services.name)),
      tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1),
    ]);
    const vacation = currentVacation(match, businessToday(business[0]?.timezone ?? "UTC"));
    return { ok: true as const, staffId: match.staffId, name: match.name, phone: match.phone, services: assigned.map((service) => service.name), vacation };
  });
}
