import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";

import { businesses, businessHours, closures, enqueueOutbox, services, staff, staffServiceAssignments, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import type { HoursWindow } from "@lobbystack/shared";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import { normalizeClosures, normalizeHoursWindows } from "../hours";
import type { DomainContext } from "./context";
import { assertTransferNumberAllowed, trialTransferNumberInTransaction } from "./numberTrials";

// Employees are the staff members a business lists by name. Deleted ones stay as inactive staff for their past appointments.
// Their working hours are business_hours rows with their staff_id (none: the business's hours), and their time off is
// closures with their staff_id.
const employeeColumns = { id: staff.id, name: staff.name, phone: staff.transferNumber, createdAt: staff.createdAt, updatedAt: staff.updatedAt };

/** Days off, inclusive, as YYYY-MM-DD in the business's timezone. */
export type EmployeeTimeOff = { startsOn: string; endsOn: string };

/** Working, off today, or not bookable because they do no service. */
export type EmployeeStatus = "working" | "off" | "no_services";

/** The business's current date, YYYY-MM-DD. */
export function businessToday(timezone: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(timezone).toISODate()!;
}

/** A time-off closure as the days it covers in the business's timezone. It ends at midnight after its last day. */
export function timeOffDays(row: { startsAt: Date; endsAt: Date }, timezone: string): EmployeeTimeOff {
  return { startsOn: DateTime.fromJSDate(row.startsAt).setZone(timezone).toISODate()!, endsOn: DateTime.fromJSDate(new Date(row.endsAt.getTime() - 1)).setZone(timezone).toISODate()! };
}

export function employeeStatus(input: { timeOff: EmployeeTimeOff[]; serviceCount: number; today: string }): EmployeeStatus {
  if (input.timeOff.some((entry) => entry.startsOn <= input.today && input.today <= entry.endsOn)) return "off";
  return input.serviceCount ? "working" : "no_services";
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks an employee's hours (null: the business's) and time off, and returns
 * the rows to save. Time off follows the rules of the business's closures: no
 * overlaps, none already over, none ending more than two years ahead.
 */
function requireSchedule(input: { hours: HoursWindow[] | null; timeOff: EmployeeTimeOff[] }, timezone: string) {
  if (input.hours && !input.hours.length) throw Object.assign(new Error("Add at least one working day, or use the business's hours."), { status: 400, code: "employee_hours_required" });
  const hours = input.hours ? normalizeHoursWindows(input.hours) : null;
  for (const entry of input.timeOff) {
    if (![entry.startsOn, entry.endsOn].every((day) => ISO_DAY.test(day) && DateTime.fromISO(day).isValid) || entry.endsOn < entry.startsOn) throw Object.assign(new Error("Choose the first and last day of each time off."), { status: 400, code: "employee_time_off_invalid" });
  }
  try {
    const timeOff = normalizeClosures(input.timeOff.map((entry) => ({ startsAt: `${entry.startsOn}T00:00`, endsAt: `${DateTime.fromISO(entry.endsOn).plus({ days: 1 }).toISODate()}T00:00` })), timezone, new Date());
    return { hours, timeOff };
  } catch (error) {
    throw Object.assign(error as Error, { code: "employee_time_off_invalid" });
  }
}

async function replaceSchedule(tx: DatabaseTransaction, businessId: string, staffId: string, schedule: ReturnType<typeof requireSchedule>) {
  await tx.delete(businessHours).where(and(eq(businessHours.businessId, businessId), eq(businessHours.staffId, staffId)));
  if (schedule.hours) await tx.insert(businessHours).values(schedule.hours.map((window) => ({ businessId, staffId, ...window })));
  // Time off that already ended isn't listed, so a save drops it, as with the business's closures.
  await tx.delete(closures).where(and(eq(closures.businessId, businessId), eq(closures.staffId, staffId)));
  if (schedule.timeOff.length) await tx.insert(closures).values(schedule.timeOff.map((entry) => ({ businessId, staffId, ...entry })));
}

function activeEmployees(businessId: string, ...conditions: SQL[]) {
  return and(eq(staff.businessId, businessId), eq(staff.isEmployee, true), eq(staff.active, true), ...conditions);
}

async function refreshSnapshot(tx: DatabaseTransaction, businessId: string, employeeId: string, reason: string) {
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId, aggregateType: "employee", aggregateId: employeeId, dedupeKey: `employee:${employeeId}:snapshot:${Date.now()}`, payload: { businessId, reason } });
}

async function assertPhoneAvailable(tx: DatabaseTransaction, input: { businessId: string; phone: string | null; employeeId?: string }) {
  if (!input.phone) return;
  // The same rules as the business's transfer number.
  await assertTransferNumberAllowed(tx, { businessId: input.businessId, phone: input.phone });
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
  if (serviceIds.length) await tx.insert(staffServiceAssignments).values(serviceIds.map((serviceId) => ({ businessId, staffId, serviceId })));
}

function requireName(value: string): string {
  const name = value.trim();
  if (!name) throw Object.assign(new Error("Employee name is required."), { status: 400, code: "employee_name_required" });
  return name;
}

async function businessTimezone(tx: DatabaseTransaction, businessId: string): Promise<string> {
  const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) throw Object.assign(new Error("Business not found."), { status: 404 });
  return business.timezone;
}

/** Each staff member's own hours, when they have them, and the time off that hasn't ended, in day order. */
export async function loadStaffSchedules(tx: DatabaseTransaction, input: { businessId: string; staffIds: string[]; timezone: string; now?: Date }) {
  const [hourRows, timeOffRows] = input.staffIds.length ? await Promise.all([
    tx.select().from(businessHours).where(and(eq(businessHours.businessId, input.businessId), inArray(businessHours.staffId, input.staffIds))).orderBy(asc(businessHours.dayOfWeek), asc(businessHours.openMinutes)),
    tx.select().from(closures).where(and(eq(closures.businessId, input.businessId), inArray(closures.staffId, input.staffIds), gt(closures.endsAt, input.now ?? new Date()))).orderBy(asc(closures.startsAt)),
  ]) : [[], []];
  return new Map(input.staffIds.map((staffId) => {
    const hours = hourRows.filter((row) => row.staffId === staffId).map((row) => ({ dayOfWeek: row.dayOfWeek, openMinutes: row.openMinutes, closeMinutes: row.closeMinutes }));
    return [staffId, { hours: hours.length ? hours : null, timeOff: timeOffRows.filter((row) => row.staffId === staffId).map((row) => timeOffDays(row, input.timezone)) }];
  }));
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
    const [rows, total, serviceRows, timezone] = await Promise.all([
      tx.select(employeeColumns)
        .from(staff).where(filter).orderBy(desc(staff.createdAt), asc(staff.id)).limit(limit + 1).offset(offset),
      tx.select({ count: count() }).from(staff).where(filter),
      tx.select({ id: services.id, name: services.name }).from(services).where(and(eq(services.businessId, input.businessId), isNull(services.deletedAt))).orderBy(asc(services.name), asc(services.id)),
      businessTimezone(tx, input.businessId),
    ]);
    const today = businessToday(timezone);
    const page = rows.slice(0, limit);
    const ids = page.map((row) => row.id);
    const [assignments, schedules] = await Promise.all([
      ids.length ? tx.select({ staffId: staffServiceAssignments.staffId, serviceId: staffServiceAssignments.serviceId }).from(staffServiceAssignments).where(and(eq(staffServiceAssignments.businessId, input.businessId), inArray(staffServiceAssignments.staffId, ids))) : [],
      loadStaffSchedules(tx, { businessId: input.businessId, staffIds: ids, timezone }),
    ]);
    const order = new Map(serviceRows.map((service, index) => [service.id, index]));
    const employees = page.map((row) => {
      const serviceIds = assignments.filter((assignment) => assignment.staffId === row.id && order.has(assignment.serviceId)).map((assignment) => assignment.serviceId).sort((left, right) => order.get(left)! - order.get(right)!);
      const schedule = schedules.get(row.id)!;
      return { ...row, serviceIds, ...schedule, status: employeeStatus({ timeOff: schedule.timeOff, serviceCount: serviceIds.length, today }) };
    });
    return { employees, services: serviceRows, today, pagination: { limit, offset, total: Number(total[0]?.count ?? 0), hasNext: rows.length > limit } };
  });
}

type EmployeeFields = { name: string; phone: string | null; serviceIds: string[]; hours: HoursWindow[] | null; timeOff: EmployeeTimeOff[] };

/** Adds an employee: a staff member bookings for their services can be assigned to. `phone` is E.164, or null when calls for them go to the business. */
export async function createEmployee(
  context: DomainContext,
  input: { userId: string; businessId: string } & EmployeeFields,
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const name = requireName(input.name);
    const timezone = await businessTimezone(tx, input.businessId);
    const schedule = requireSchedule(input, timezone);
    const serviceIds = await requireServiceIds(tx, input.businessId, input.serviceIds);
    await assertPhoneAvailable(tx, input);
    const [employee] = await tx.insert(staff).values({ businessId: input.businessId, name, timezone, transferNumber: input.phone, isEmployee: true }).returning(employeeColumns);
    if (!employee) throw new Error("Employee could not be created.");
    await replaceServices(tx, input.businessId, employee.id, serviceIds);
    await replaceSchedule(tx, input.businessId, employee.id, schedule);
    await refreshSnapshot(tx, input.businessId, employee.id, "employee_created");
    return { ...employee, serviceIds };
  });
}

export async function updateEmployee(
  context: DomainContext,
  input: { userId: string; businessId: string; employeeId: string } & EmployeeFields,
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const name = requireName(input.name);
    const schedule = requireSchedule(input, await businessTimezone(tx, input.businessId));
    const serviceIds = await requireServiceIds(tx, input.businessId, input.serviceIds);
    await assertPhoneAvailable(tx, input);
    const [employee] = await tx.update(staff).set({ name, transferNumber: input.phone, updatedAt: new Date() })
      .where(activeEmployees(input.businessId, eq(staff.id, input.employeeId)))
      .returning(employeeColumns);
    if (!employee) return null;
    await replaceServices(tx, input.businessId, employee.id, serviceIds);
    await replaceSchedule(tx, input.businessId, employee.id, schedule);
    await refreshSnapshot(tx, input.businessId, employee.id, "employee_updated");
    return { ...employee, serviceIds };
  });
}

/**
 * Deactivates the employee's staff member rather than deleting it, so their
 * appointments keep their assignee. Their services lose them: a service no one
 * else does goes back to the business.
 */
export async function deleteEmployee(
  context: DomainContext,
  input: { userId: string; businessId: string; employeeId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [deleted] = await tx.update(staff).set({ active: false, updatedAt: new Date() }).where(activeEmployees(input.businessId, eq(staff.id, input.employeeId))).returning({ id: staff.id });
    if (!deleted) return false;
    await replaceServices(tx, input.businessId, deleted.id, []);
    await refreshSnapshot(tx, input.businessId, deleted.id, "employee_deleted");
    return true;
  });
}

/** The business's active employees, oldest first. */
export async function listBookableEmployees(tx: DatabaseTransaction, businessId: string) {
  return await tx.select({ name: staff.name, staffId: staff.id, phone: staff.transferNumber }).from(staff)
    .where(activeEmployees(businessId))
    .orderBy(asc(staff.createdAt), asc(staff.id));
}

/**
 * Matches a name the caller gave to one employee: an exact match, else a
 * single partial match, with the active services they do and their time off
 * that hasn't ended. During a free number trial, calls transfer only to the
 * owner's verified phone, so an employee's own number comes back null then.
 */
export async function resolveEmployee(context: DomainContext, input: { businessId: string; name: string }) {
  const wanted = input.name.trim().toLowerCase();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await listBookableEmployees(tx, input.businessId);
    const exact = rows.filter((row) => row.name.trim().toLowerCase() === wanted);
    const matches = exact.length || !wanted ? exact : rows.filter((row) => row.name.toLowerCase().includes(wanted));
    if (matches.length !== 1) return { ok: false as const, employees: rows.map((row) => row.name) };
    const match = matches[0]!;
    const [assigned, timezone, trialPhone] = await Promise.all([
      tx.select({ name: services.name }).from(staffServiceAssignments)
        .innerJoin(services, eq(services.id, staffServiceAssignments.serviceId))
        .where(and(eq(staffServiceAssignments.businessId, input.businessId), eq(staffServiceAssignments.staffId, match.staffId), eq(services.active, true), isNull(services.deletedAt)))
        .orderBy(asc(services.name)),
      businessTimezone(tx, input.businessId),
      trialTransferNumberInTransaction(tx, { businessId: input.businessId }),
    ]);
    const { timeOff } = (await loadStaffSchedules(tx, { businessId: input.businessId, staffIds: [match.staffId], timezone })).get(match.staffId)!;
    const phone = trialPhone && match.phone !== trialPhone ? null : match.phone;
    return { ok: true as const, staffId: match.staffId, name: match.name, phone, services: assigned.map((service) => service.name), timeOff };
  });
}
