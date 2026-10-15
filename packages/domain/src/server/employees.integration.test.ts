import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, businessHours, businessMemberships, businesses, calendarBusyBlocks, calendarConnections, closures, createDatabaseClient, numberTrials, services, staff, staffServiceAssignments, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { bookAppointment, findAvailability, findOpeningsInTransaction, rescheduleAppointmentInTransaction } from "./booking";
import { businessToday, createEmployee, deleteEmployee, listEmployees, resolveEmployee, updateEmployee } from "./employees";

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
  const owner = { userId: studio.userIds.business_owner!, businessId: studio.businessId, serviceIds: studio.serviceIds, hours: null, timeOff: [] };
  const viewer = { userId: studio.userIds.viewer!, businessId: studio.businessId, serviceIds: studio.serviceIds, hours: null, timeOff: [] };
  const otherOwner = { userId: other.userIds.business_owner!, businessId: other.businessId, serviceIds: other.serviceIds, hours: null, timeOff: [] };
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
      const intruder = { userId: otherOwner.userId, businessId: owner.businessId, serviceIds: owner.serviceIds, hours: null, timeOff: [] };
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

  it("stores several time off entries, reports the employee's status from them, and drops ones that ended", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner } = await seed(tx);
      const today = businessToday("Europe/Belgrade");
      const day = (offset: number) => DateTime.fromISO(today).plus({ days: offset }).toISODate()!;
      const invalid = { status: 400, code: "employee_time_off_invalid" };
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: null, timeOff: [{ startsOn: day(2), endsOn: day(1) }] })).rejects.toMatchObject(invalid);
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: null, timeOff: [{ startsOn: "2026-02-30", endsOn: "2026-03-02" }] })).rejects.toMatchObject(invalid);
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: null, timeOff: [{ startsOn: day(-9), endsOn: day(-1) }] })).rejects.toMatchObject(invalid);
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: null, timeOff: [{ startsOn: day(1), endsOn: day(4) }, { startsOn: day(4), endsOn: day(6) }] })).rejects.toMatchObject(invalid);

      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: null, timeOff: [{ startsOn: day(10), endsOn: day(12) }, { startsOn: day(0), endsOn: day(3) }] });
      const status = async () => (await listEmployees({ db }, owner)).employees.find((employee) => employee.id === ana.id);
      expect(await status()).toMatchObject({ status: "off", hours: null, timeOff: [{ startsOn: day(0), endsOn: day(3) }, { startsOn: day(10), endsOn: day(12) }] });
      // Each entry is a closure of that employee only, from midnight to the midnight after its last day.
      const rows = await tx.select({ staffId: closures.staffId, startsAt: closures.startsAt, endsAt: closures.endsAt }).from(closures).where(eq(closures.businessId, owner.businessId)).orderBy(closures.startsAt);
      expect(rows[0]).toEqual({ staffId: ana.id, startsAt: DateTime.fromISO(day(0), { zone: "Europe/Belgrade" }).toJSDate(), endsAt: DateTime.fromISO(day(4), { zone: "Europe/Belgrade" }).toJSDate() });

      await updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana", phone: null, timeOff: [{ startsOn: day(5), endsOn: day(9) }] });
      expect(await status()).toMatchObject({ status: "working", timeOff: [{ startsOn: day(5), endsOn: day(9) }] });

      // Time off that ended isn't listed.
      await tx.insert(closures).values({ businessId: owner.businessId, staffId: ana.id, startsAt: DateTime.fromISO(day(-5), { zone: "Europe/Belgrade" }).toJSDate(), endsAt: DateTime.fromISO(day(-2), { zone: "Europe/Belgrade" }).toJSDate(), reason: "" });
      expect(await status()).toMatchObject({ timeOff: [{ startsOn: day(5), endsOn: day(9) }] });

      await tx.delete(staffServiceAssignments).where(eq(staffServiceAssignments.staffId, ana.id));
      expect(await status()).toMatchObject({ status: "no_services", serviceIds: [] });
    });
  });

  it("works the business's hours by default, or the custom hours it's given", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner } = await seed(tx);
      const mornings = [{ dayOfWeek: 2, openMinutes: 540, closeMinutes: 720 }, { dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }];
      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: null, hours: mornings });
      const hours = async () => (await listEmployees({ db }, owner)).employees.find((employee) => employee.id === ana.id)?.hours;
      expect(await hours()).toEqual([mornings[1], mornings[0]]);
      await expect(updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana", phone: null, hours: [] })).rejects.toMatchObject({ status: 400, code: "employee_hours_required" });
      await expect(updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana", phone: null, hours: [{ dayOfWeek: 1, openMinutes: 720, closeMinutes: 540 }] })).rejects.toMatchObject({ status: 400 });
      await updateEmployee({ db }, { ...owner, employeeId: ana.id, name: "Ana", phone: null, hours: null });
      expect(await hours()).toBeNull();
      // The business's own hours are untouched.
      expect(await tx.select().from(businessHours).where(eq(businessHours.businessId, owner.businessId))).toEqual([]);
    });
  });

  it("removes a deleted employee's services, so a service no one else does goes back to the business", async () => {
    await rollbackTest(async (tx) => {
      const { db, studio, owner } = await seed(tx);
      const [colour] = owner.serviceIds;
      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: null, serviceIds: [colour!] });
      await openEveryDay(tx, owner.businessId);
      const startsAt = "2030-01-07T09:00:00.000Z";
      expect((await findAvailability({ db }, { businessId: owner.businessId, serviceId: colour!, startsAt })).map((slot) => slot.staffId)).toEqual([ana.id]);
      await deleteEmployee({ db }, { ...owner, employeeId: ana.id });
      expect(await tx.select().from(staffServiceAssignments).where(eq(staffServiceAssignments.staffId, ana.id))).toEqual([]);
      expect((await findAvailability({ db }, { businessId: owner.businessId, serviceId: colour!, startsAt })).map((slot) => slot.staffId)).toEqual([studio.defaultStaffId]);
    });
  });
});

/** Open around the clock, so only staff hours and time off decide. */
async function openEveryDay(tx: DatabaseTransaction, businessId: string) {
  await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1440 })));
}

describe.skipIf(!client)("booking employees", () => {
  // Monday 2030-01-07 in Belgrade, an hour ahead of UTC.
  const monday = (time: string) => DateTime.fromISO(`2030-01-07T${time}`, { zone: "Europe/Belgrade" }).toUTC().toISO()!;
  const book = (db: Database, businessId: string, serviceId: string, startsAt: string, contactPhone = "+381641110000") => bookAppointment({ db }, { businessId, serviceId, startsAt, timezone: "Europe/Belgrade", contactPhone, sourceChannel: "voice" });

  it("books an employee only inside their own hours and outside their time off", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner } = await seed(tx);
      const [colour] = owner.serviceIds;
      await openEveryDay(tx, owner.businessId);
      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: null, serviceIds: [colour!], hours: [{ dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 12 * 60 }] });
      const slots = async (time: string) => (await findAvailability({ db }, { businessId: owner.businessId, serviceId: colour!, startsAt: monday(time) })).map((slot) => slot.staffId);
      expect(await slots("09:00")).toEqual([ana.id]);
      expect(await slots("11:45")).toEqual([]);
      expect(await slots("14:00")).toEqual([]);
      await expect(book(db, owner.businessId, colour!, monday("14:00"))).rejects.toMatchObject({ reason: "taken" });

      // Time off that day: findOpenings has nothing to offer, and says so as a day with no free times.
      await tx.insert(closures).values({ businessId: owner.businessId, staffId: ana.id, startsAt: new Date(monday("00:00")), endsAt: new Date(monday("23:59")), reason: "" });
      expect(await slots("09:00")).toEqual([]);
      const openings = await withBusinessTransaction(db, { businessId: owner.businessId, actorType: "worker" }, (workerTx) => findOpeningsInTransaction(workerTx, { businessId: owner.businessId, serviceId: colour!, dates: ["2030-01-07"] }));
      expect(openings).toMatchObject({ openings: [], reason: "taken" });
    });
  });

  it("tells the receptionist the name of the employee it booked, and nothing for the business's own staff", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner } = await seed(tx);
      const [colour, haircut] = owner.serviceIds;
      await openEveryDay(tx, owner.businessId);
      await createEmployee({ db }, { ...owner, name: "Ana", phone: null, serviceIds: [colour!] });
      expect(await book(db, owner.businessId, colour!, monday("10:00"))).toMatchObject({ employeeName: "Ana" });
      expect(await book(db, owner.businessId, haircut!, monday("10:00"))).not.toHaveProperty("employeeName");
    });
  });

  it("reschedules an appointment whose staff member no longer does its service: kept while free, else moved to someone who does", async () => {
    await rollbackTest(async (tx) => {
      const { db, studio, owner } = await seed(tx);
      const [colour] = owner.serviceIds;
      await openEveryDay(tx, owner.businessId);
      // Booked with the business's own staff before Ana took over the service.
      const { appointmentId } = await book(db, owner.businessId, colour!, monday("09:00"));
      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: null, serviceIds: [colour!] });
      const move = (startsAt: string) => withBusinessTransaction(db, { businessId: owner.businessId, actorType: "worker" }, (workerTx) => rescheduleAppointmentInTransaction(workerTx, { businessId: owner.businessId, appointmentId, startsAt, change: { source: "caller" } }));
      const staffOf = async () => (await tx.select({ staffId: appointments.staffId }).from(appointments).where(eq(appointments.id, appointmentId)))[0]?.staffId;

      await expect(move(monday("10:00"))).resolves.toMatchObject({ appointmentId });
      expect(await staffOf()).toBe(studio.defaultStaffId);

      // The business's staff is busy at 11:00, so the appointment goes to Ana.
      const other = await book(db, owner.businessId, owner.serviceIds[1]!, monday("11:00"), "+381641110001");
      expect(other.staffId).toBe(studio.defaultStaffId);
      await expect(move(monday("11:00"))).resolves.toMatchObject({ appointmentId });
      expect(await staffOf()).toBe(ana.id);

      // Ana leaves; the business takes the service, and her appointment, back.
      await deleteEmployee({ db }, { ...owner, employeeId: ana.id });
      await expect(move(monday("13:00"))).resolves.toMatchObject({ appointmentId });
      expect(await staffOf()).toBe(studio.defaultStaffId);
    });
  });

  it("blocks only the business's own staff with a calendar that has no staff owner", async () => {
    await rollbackTest(async (tx) => {
      const { db, studio, owner } = await seed(tx);
      const [colour] = owner.serviceIds;
      await openEveryDay(tx, owner.businessId);
      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: null, serviceIds: [colour!] });
      await tx.insert(staffServiceAssignments).values({ businessId: owner.businessId, staffId: studio.defaultStaffId, serviceId: colour! });
      // Inside the freshness horizon of a calendar synced now.
      const startsAt = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000);
      const [connection] = await tx.insert(calendarConnections).values({ businessId: owner.businessId, ownerUserId: owner.userId, provider: "google", externalAccountId: "owner@example.invalid", selectedCalendarId: "business@group.calendar.google.com", status: "connected", lastSyncedAt: new Date() }).returning();
      await tx.insert(calendarBusyBlocks).values({ businessId: owner.businessId, connectionId: connection!.id, startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60_000) });
      expect((await findAvailability({ db }, { businessId: owner.businessId, serviceId: colour!, startsAt: startsAt.toISOString() })).map((slot) => slot.staffId)).toEqual([ana.id]);

      // A stale business calendar holds up only the business's own staff too.
      await tx.update(calendarConnections).set({ lastSyncedAt: new Date(Date.now() - 60 * 60_000) }).where(eq(calendarConnections.id, connection!.id));
      expect((await findAvailability({ db }, { businessId: owner.businessId, serviceId: colour!, startsAt: new Date(startsAt.getTime() + 2 * 3_600_000).toISOString() })).map((slot) => slot.staffId)).toEqual([ana.id]);
    });
  });
});

describe.skipIf(!client)("employee transfer numbers", () => {
  it("follow the business transfer number's rules: a valid number, and only the owner's verified phone during a free trial", async () => {
    await rollbackTest(async (tx) => {
      const { db, owner } = await seed(tx);
      await expect(createEmployee({ db }, { ...owner, name: "Ana", phone: "0641234567" })).rejects.toMatchObject({ status: 400, code: "transfer_number_invalid" });
      const ana = await createEmployee({ db }, { ...owner, name: "Ana", phone: "+381641234567" });
      await tx.insert(numberTrials).values({ businessId: owner.businessId, userId: owner.userId, verifiedPhone: "+381601111111", status: "active" });

      await expect(createEmployee({ db }, { ...owner, name: "Marko", phone: "+381642222222" })).rejects.toMatchObject({ status: 409, code: "trial_transfer_locked" });
      await expect(createEmployee({ db }, { ...owner, name: "Owner", phone: "+381601111111" })).resolves.toMatchObject({ phone: "+381601111111" });
      // An employee saved before the trial keeps their number, but the receptionist doesn't dial it during the trial.
      await expect(resolveEmployee({ db }, { businessId: owner.businessId, name: "Ana" })).resolves.toMatchObject({ ok: true, staffId: ana.id, phone: null });
      await expect(resolveEmployee({ db }, { businessId: owner.businessId, name: "Owner" })).resolves.toMatchObject({ ok: true, phone: "+381601111111" });
    });
  });
});
