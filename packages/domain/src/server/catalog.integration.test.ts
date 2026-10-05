import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, businessMemberships, businesses, contacts, createDatabaseClient, services, staff, staffServiceAssignments, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { assignStaffToService, createService, deleteService, listCatalog, updateService } from "./catalog";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Catalog integration tests require a dedicated local test database.");
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

/** A business owner with one service that a past appointment still references. */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userId = randomUUID();
  const staffId = randomUUID();
  const contactId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Catalog test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
  await tx.insert(staff).values({ id: staffId, businessId, name: "Sam", timezone: "UTC" });
  await tx.insert(contacts).values({ id: contactId, businessId, name: "Ana" });
  const db = tx as unknown as Database;
  const serviceId = await createService({ db }, { userId, businessId, name: "Drain cleaning", slug: "drain-cleaning", durationMinutes: 30 });
  await assignStaffToService({ db }, { userId, businessId, staffId, serviceId });
  const startsAt = new Date(Date.now() - 86_400_000);
  const [appointment] = await tx.insert(appointments).values({ businessId, contactId, staffId, serviceId, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "UTC", sourceChannel: "voice" }).returning({ id: appointments.id });
  return { db, businessId, userId, staffId, serviceId, appointmentId: appointment!.id };
}

describe.skipIf(!client)("service deletion under operator RLS", () => {
  it("removes the service from the catalog and keeps appointment history", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId, staffId, serviceId, appointmentId } = await seed(tx);
      await deleteService({ db }, { userId, businessId, serviceId });

      const catalog = await listCatalog({ db }, { userId, businessId });
      expect(catalog.services.map((service) => service.id)).not.toContain(serviceId);
      expect(catalog.servicesPagination.total).toBe(0);

      const [row] = await tx.select({ active: services.active, deletedAt: services.deletedAt }).from(services).where(eq(services.id, serviceId));
      expect(row).toMatchObject({ active: false, deletedAt: expect.any(Date) });
      const [appointment] = await tx.select({ serviceId: appointments.serviceId }).from(appointments).where(eq(appointments.id, appointmentId));
      expect(appointment?.serviceId).toBe(serviceId);
      expect(await tx.select().from(staffServiceAssignments).where(eq(staffServiceAssignments.serviceId, serviceId))).toEqual([]);

      await expect(updateService({ db }, { userId, businessId, serviceId, active: true })).rejects.toMatchObject({ status: 404 });
      await expect(deleteService({ db }, { userId, businessId, serviceId })).rejects.toMatchObject({ status: 404 });
      await expect(assignStaffToService({ db }, { userId, businessId, staffId, serviceId })).rejects.toMatchObject({ status: 404 });
    });
  });

  it("frees the slug for a new service with the same name", async () => {
    await rollbackTest(async (tx) => {
      const { db, businessId, userId, serviceId } = await seed(tx);
      await deleteService({ db }, { userId, businessId, serviceId });
      const replacementId = await createService({ db }, { userId, businessId, name: "Drain cleaning", slug: "drain-cleaning", durationMinutes: 45 });
      const catalog = await listCatalog({ db }, { userId, businessId });
      expect(catalog.services.map((service) => service.id)).toEqual([replacementId]);
    });
  });
});
