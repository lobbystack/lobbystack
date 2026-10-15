import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, describe, expect, it } from "vitest";
import { businessMemberships, businesses, createDatabaseClient, services, staff, staffServiceAssignments, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { businessToday, createEmployee, deleteEmployee, listEmployees, updateEmployee } from "./employees";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Employee integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

/** Two businesses, each with the default staff member that stands for it and services. The first has an owner and a viewer. */
async function seed(tx: DatabaseTransaction) {
  const business = async (name: string, roles: string[], serviceNames: string[]) => {
    const businessId = randomUUID();
    await tx.insert(businesses).values({ id: businessId, slug: businessId, name, timezone: "Europe/Belgrade", businessType: "test", telemetryEnabled: false });
    const [standIn] = await tx.insert(staff).values({ businessId, name, timezone: "Europe/Belgrade" }).returning({ id: staff.id });
    const serviceIds = (await tx.insert(services).values(serviceNames.map((serviceName) => ({ businessId, name: serviceName, slug: serviceName.toLowerCase(), durationMinutes: 30 }))).returning({ id: services.id })).map((service) => service.id);
    const userIds: Record<string, string> = {};
    for (const role of roles) {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
      await tx.insert(businessMemberships).values({ businessId, userId, role });
      userIds[role] = userId;
    }
    return { businessId, defaultStaffId: standIn!.id, serviceIds, userIds };
  };
  const studio = await business("Studio", ["business_owner", "viewer"], ["Colour", "Haircut"]);
  const other = await business("Other studio", ["business_owner"], ["Shave"]);
  const db = tx as unknown as Database;
  const owner = { userId: studio.userIds.business_owner!, businessId: studio.businessId, serviceIds: studio.serviceIds, vacation: null };
  const viewer = { userId: studio.userIds.viewer!, businessId: studio.businessId, serviceIds: studio.serviceIds, vacation: null };
  const otherOwner = { userId: other.userIds.business_owner!, businessId: other.businessId, serviceIds: other.serviceIds, vacation: null };
  const row = async (id: string) => (await tx.select({ name: staff.name, phone: staff.transferNumber, active: staff.active, isEmployee: staff.isEmployee, timezone: staff.timezone }).from(staff).where(eq(staff.id, id)))[0];
  const names = async (actor: { userId: string; businessId: string }) => (await listEmployees({ db }, actor)).employees.map((employee) => employee.name);
  return { db, studio, owner, viewer, otherOwner, row, names };
}

describe.skipIf(!client)("employees under operator RLS", () => {
  it("creates, updates and deletes an employee as a staff member of the business", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner, row, names } = await seed(tx);
      const ana = await createEmployee({ db }, { ...owner, name: "  Ana  ", phone: "+381641234567" });
      expect(ana).toMatchObject({ name: "Ana", phone: "+381641234567" });
      expect(await row(ana.id)).toEqual({ name: "Ana", phone: "+381641234567", active: true, isEmployee: true, timezone: "Europe/Belgrade" });

      await expect(updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana Petrović", phone: null })).resolves.toMatchObject({ name: "Ana Petrović", phone: null });
      expect(await names(owner)).toEqual(["Ana Petrović"]);

      // Deleting keeps the staff row, inactive, for the appointments it holds.
      await expect(deleteEmployee({ db }, { ...owner, employeeId: ana.id })).resolves.toBe(true);
      expect(await row(ana.id)).toMatchObject({ active: false, isEmployee: true });
      expect(await names(owner)).toEqual([]);
      await expect(updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana", phone: null })).resolves.toBeNull();
      await expect(deleteEmployee({ db }, { ...owner, employeeId: ana.id })).resolves.toBe(false);
    });
  });

  it("keeps phones unique among active employees, and frees a deleted employee's phone", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner } = await seed(tx);
      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: "+381641234567" });
      await expect(createEmployee({ db }, { ...owner, name: "Marko", phone: "+381641234567" })).rejects.toMatchObject({ status: 409, code: "employee_phone_exists" });
      // Employees without a phone don't clash with each other.
      await createEmployee({ db }, { ...owner, name: "Sara", phone: null });
      await createEmployee({ db }, { ...owner, name: "Zoran", phone: null });
      await deleteEmployee({ db }, { ...owner, employeeId: ana.id });
      await expect(createEmployee({ db }, { ...owner, name: "Marko", phone: "+381641234567" })).resolves.toMatchObject({ phone: "+381641234567" });
    });
  });

  it("leaves the default staff member that stands for the business off the list and out of reach", async () => {
    await rollbackTest(async (tx) => {
      const { db, studio, owner, row, names } = await seed(tx);
      await createEmployee({ db }, { ...owner, name: "Ana", phone: null });
      expect(await names(owner)).toEqual(["Ana"]);
      await expect(updateEmployee({ db }, { ...owner, employeeId: studio.defaultStaffId, name: "Renamed", phone: null })).resolves.toBeNull();
      await expect(deleteEmployee({ db }, { ...owner, employeeId: studio.defaultStaffId })).resolves.toBe(false);
      expect(await row(studio.defaultStaffId)).toMatchObject({ name: "Studio", active: true, isEmployee: false });
    });
  });

  it("lets a viewer see employees but not create, update or delete them", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner, viewer, row, names } = await seed(tx);
      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: "+381641234567" });
      expect(await names(viewer)).toEqual(["Ana"]);
      await expect(createEmployee({ db }, { ...viewer, name: "Marko", phone: null })).rejects.toMatchObject({ status: 403 });
      await expect(updateEmployee({ db }, { ...viewer, employeeId: ana.id, name: "Changed", phone: null })).rejects.toMatchObject({ status: 403 });
      await expect(deleteEmployee({ db }, { ...viewer, employeeId: ana.id })).rejects.toMatchObject({ status: 403 });
      expect(await row(ana.id)).toMatchObject({ name: "Ana", phone: "+381641234567", active: true });
      expect(await names(owner)).toEqual(["Ana"]);
    });
  });

  it("keeps another business's employees invisible and out of reach", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner, otherOwner, row, names } = await seed(tx);
      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: "+381641234567" });
      await createEmployee({ db }, { ...otherOwner, name: "Marko", phone: null });

      expect(await names(owner)).toEqual(["Ana"]);
      expect(await names(otherOwner)).toEqual(["Marko"]);
      expect((await listEmployees({ db }, { ...otherOwner, search: "Ana" })).pagination.total).toBe(0);
      // The same phone in another business is a different person.
      await expect(createEmployee({ db }, { ...otherOwner, name: "Ana's twin", phone: "+381641234567" })).resolves.toMatchObject({ phone: "+381641234567" });

      // Acting in their own business, the other owner can't reach Ana.
      await expect(updateEmployee({ db }, { ...otherOwner, employeeId: ana.id, name: "Taken", phone: null })).resolves.toBeNull();
      await expect(deleteEmployee({ db }, { ...otherOwner, employeeId: ana.id })).resolves.toBe(false);
      // Naming the first business instead fails the membership check.
      const intruder = { userId: otherOwner.userId, businessId: owner.businessId, serviceIds: owner.serviceIds, vacation: null };
      await expect(listEmployees({ db }, intruder)).rejects.toMatchObject({ status: 403 });
      await expect(updateEmployee({ db }, { ...intruder, employeeId: ana.id, name: "Taken", phone: null })).rejects.toMatchObject({ status: 403 });
      await expect(deleteEmployee({ db }, { ...intruder, employeeId: ana.id })).rejects.toMatchObject({ status: 403 });
      expect(await row(ana.id)).toMatchObject({ name: "Ana", phone: "+381641234567", active: true });
    });
  });

  it("requires at least one of the business's own services and replaces them on update", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner, otherOwner } = await seed(tx);
      const [colour, haircut] = owner.serviceIds;
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: null, serviceIds: [] })).rejects.toMatchObject({ status: 400, code: "employee_services_required" });
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: null, serviceIds: otherOwner.serviceIds })).rejects.toMatchObject({ status: 400, code: "employee_service_invalid" });
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: null, serviceIds: ["not-a-uuid"] })).rejects.toMatchObject({ status: 400, code: "employee_service_invalid" });

      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: null, serviceIds: [haircut!, colour!, haircut!] });
      const listed = await listEmployees({ db }, owner);
      expect(listed.services.map((service) => service.name)).toEqual(["Colour", "Haircut"]);
      expect(listed.employees[0]).toMatchObject({ id: ana.id, serviceIds: [colour, haircut] });

      await expect(updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana", phone: null, serviceIds: [haircut!] })).resolves.toMatchObject({ serviceIds: [haircut] });
      expect(await tx.select({ serviceId: staffServiceAssignments.serviceId }).from(staffServiceAssignments).where(eq(staffServiceAssignments.staffId, ana.id))).toEqual([{ serviceId: haircut }]);
      await expect(updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana", phone: null, serviceIds: [] })).rejects.toMatchObject({ code: "employee_services_required" });
    });
  });

  it("stores a vacation, reports the employee's status from it, and drops one that has ended", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner } = await seed(tx);
      const today = businessToday("Europe/Belgrade");
      const day = (offset: number) => DateTime.fromISO(today).plus({ days: offset }).toISODate()!;
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: null, vacation: { startsOn: day(2), endsOn: day(1) } })).rejects.toMatchObject({ status: 400, code: "employee_vacation_invalid" });
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: null, vacation: { startsOn: "2026-02-30", endsOn: "2026-03-02" } })).rejects.toMatchObject({ code: "employee_vacation_invalid" });

      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: null, vacation: { startsOn: day(0), endsOn: day(3) } });
      const status = async () => (await listEmployees({ db }, owner)).employees.find((employee) => employee.id === ana.id);
      expect(await status()).toMatchObject({ status: "on_vacation", vacation: { startsOn: day(0), endsOn: day(3) } });

      await updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana", phone: null, vacation: { startsOn: day(5), endsOn: day(9) } });
      expect(await status()).toMatchObject({ status: "working", vacation: { startsOn: day(5), endsOn: day(9) } });

      await updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana", phone: null, vacation: { startsOn: day(-9), endsOn: day(-1) } });
      expect(await status()).toMatchObject({ status: "working", vacation: null });

      await tx.delete(staffServiceAssignments).where(eq(staffServiceAssignments.staffId, ana.id));
      expect(await status()).toMatchObject({ status: "no_services", serviceIds: [] });
    });
  });
});
