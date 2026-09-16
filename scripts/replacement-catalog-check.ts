import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, createDatabaseClient, staff, staffServiceAssignments, users, withBusinessTransaction } from "@lobbystack/db";
import { createService, listCatalog } from "@lobbystack/domain";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const auth = createDatabaseClient("lobbystack_auth"), worker = createDatabaseClient("lobbystack_worker"), app = createDatabaseClient("lobbystack_app");
const userId = randomUUID(), businessId = randomUUID(), foreignBusinessId = randomUUID();
try {
  await auth.db.insert(users).values({ id: userId, email: `${userId}@catalog.invalid`, normalizedEmail: `${userId}@catalog.invalid` });
  for (const tenant of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: tenant, actorType: "worker" }, async (tx) => {
    await tx.insert(businesses).values({ id: tenant, slug: `catalog-${tenant}`, name: "Catalog certification", timezone: "UTC", businessType: "clinic" });
    await tx.insert(businessMemberships).values({ businessId: tenant, userId, role: "business_owner", status: "active" });
  });
  const first = await createService({ db: app.db }, { userId, businessId, name: "A consultation", slug: "a-consultation", durationMinutes: 45, active: false });
  const second = await createService({ db: app.db }, { userId, businessId, name: "B consultation", slug: "b-consultation", durationMinutes: 30 });
  const staffId = randomUUID();
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
    await tx.insert(staff).values({ id: staffId, businessId, name: "Jordan", timezone: "UTC" });
    await tx.insert(staffServiceAssignments).values([{ businessId, staffId, serviceId: first }, { businessId, staffId, serviceId: second }]);
  });
  const catalog = await listCatalog({ db: app.db }, { userId, businessId });
  assert(catalog.services.length === 2 && catalog.services.every(service => service.assignedStaffIds.includes(staffId)), "Multi-service catalog lost staff assignments.");
  assert(catalog.services.find(service => service.id === first)?.active === false, "Creating an inactive service ignored the saved state.");
  assert(catalog.services.find(service => service.id === second)?.active === true, "Default service activation changed.");
  const page = await listCatalog({ db: app.db }, { userId, businessId, limit: 1, offset: 1 });
  assert(page.services.length === 1 && page.services[0]?.id === second && !page.servicesPagination.hasNext && page.servicesPagination.total === 2, "Catalog pagination returned incorrect results.");
  const foreign = await listCatalog({ db: app.db }, { userId, businessId: foreignBusinessId });
  assert(foreign.services.length === 0 && foreign.staff.length === 0, "Catalog or staff crossed tenant boundaries.");
  console.log(JSON.stringify({ inactiveCreation: true, activeDefault: true, multipleServiceAssignments: true, pagination: true, tenantIsolation: true }));
} finally {
  for (const tenant of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: tenant, actorType: "worker" }, async (tx) => tx.delete(businesses).where(eq(businesses.id, tenant)));
  await auth.db.delete(users).where(eq(users.id, userId));
  await Promise.all([auth.pool.end(), worker.pool.end(), app.pool.end()]);
}
