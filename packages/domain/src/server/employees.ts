import { and, asc, count, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";

import { businesses, enqueueOutbox, staff, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

// Employees are the staff members a business lists by name. Deleted ones stay as inactive staff for their past appointments.
const employeeColumns = { id: staff.id, name: staff.name, phone: staff.transferNumber, createdAt: staff.createdAt, updatedAt: staff.updatedAt };

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
    const [rows, total] = await Promise.all([
      tx.select(employeeColumns)
        .from(staff).where(filter).orderBy(desc(staff.createdAt), asc(staff.id)).limit(limit + 1).offset(offset),
      tx.select({ count: count() }).from(staff).where(filter),
    ]);
    return { employees: rows.slice(0, limit), pagination: { limit, offset, total: Number(total[0]?.count ?? 0), hasNext: rows.length > limit } };
  });
}

/** Adds an employee: a staff member bookings can be assigned to. `phone` is E.164, or null when calls for them go to the business. */
export async function createEmployee(
  context: DomainContext,
  input: { userId: string; businessId: string; name: string; phone: string | null },
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const name = requireName(input.name);
    await assertPhoneAvailable(tx, input);
    const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business) throw Object.assign(new Error("Business not found."), { status: 404 });
    const [employee] = await tx.insert(staff).values({ businessId: input.businessId, name, timezone: business.timezone, transferNumber: input.phone, isEmployee: true }).returning(employeeColumns);
    if (!employee) throw new Error("Employee could not be created.");
    await refreshSnapshot(tx, input.businessId, employee.id, "employee_created");
    return employee;
  });
}

export async function updateEmployee(
  context: DomainContext,
  input: { userId: string; businessId: string; employeeId: string; name: string; phone: string | null },
) {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const name = requireName(input.name);
    await assertPhoneAvailable(tx, input);
    const [employee] = await tx.update(staff).set({ name, transferNumber: input.phone, updatedAt: new Date() })
      .where(activeEmployees(input.businessId, eq(staff.id, input.employeeId)))
      .returning(employeeColumns);
    if (!employee) return null;
    await refreshSnapshot(tx, input.businessId, employee.id, "employee_updated");
    return employee;
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
  return await tx.select({ name: staff.name, staffId: staff.id, phone: staff.transferNumber }).from(staff)
    .where(activeEmployees(businessId))
    .orderBy(asc(staff.createdAt), asc(staff.id));
}

/** Matches a name the caller gave to one employee: an exact match, else a single partial match. */
export async function resolveEmployee(context: DomainContext, input: { businessId: string; name: string }) {
  const wanted = input.name.trim().toLowerCase();
  const rows = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await listBookableEmployees(tx, input.businessId));
  const exact = rows.filter((row) => row.name.trim().toLowerCase() === wanted);
  const matches = exact.length || !wanted ? exact : rows.filter((row) => row.name.toLowerCase().includes(wanted));
  return matches.length === 1
    ? { ok: true as const, staffId: matches[0]!.staffId, name: matches[0]!.name, phone: matches[0]!.phone }
    : { ok: false as const, employees: rows.map((row) => row.name) };
}
