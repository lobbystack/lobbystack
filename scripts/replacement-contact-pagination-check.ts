import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, calls, contacts, createDatabaseClient, users, withBusinessTransaction } from "@lobbystack/db";
import { deleteContact, listContacts } from "@lobbystack/domain";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function main() {
  const auth = createDatabaseClient("lobbystack_auth"); const worker = createDatabaseClient("lobbystack_worker"); const app = createDatabaseClient("lobbystack_app");
  const userId = randomUUID(); const businessId = randomUUID(); const foreignId = randomUUID();
  const ids = Array.from({ length: 101 }, () => randomUUID());
  const baseline = new Date("2026-01-01T12:00:00Z"); const callAt = new Date("2026-02-01T12:00:00Z");
  try {
    await auth.db.insert(users).values({ id: userId, email: `${userId}@contacts.invalid`, normalizedEmail: `${userId}@contacts.invalid` });
    for (const id of [businessId, foreignId]) await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id, name: "Contact certification", slug: `contacts-${id}`, timezone: "UTC", businessType: "service_company" });
      if (id === businessId) await tx.insert(businessMemberships).values({ businessId: id, userId, role: "business_owner", status: "active" });
      await tx.insert(contacts).values(id === businessId ? ids.map((contactId, index) => ({ id: contactId, businessId: id, name: index === 100 ? "Needle contact" : `Contact ${index}`, phone: `+1416555${String(index).padStart(4,"0")}`, createdAt: baseline, updatedAt: new Date("2026-03-01T12:00:00Z") })) : [{ businessId: id, name: "Needle foreign", phone: "+14165550999" }]);
      if (id === businessId) await tx.insert(calls).values({ businessId: id, contactId: ids[100]!, providerCallId: randomUUID(), transport: "voice", startedAt: callAt, status: "completed" });
    });
    const first = await listContacts({ db: app.db }, { businessId, userId, limit: 10 });
    assert(first.pagination.total === 101 && first.contacts.length === 10 && first.pagination.hasNext, "The first page did not include the full tenant total.");
    assert(first.contacts[0]?.id === ids[100], "Contact order does not reflect latest activity.");
    assert(new Date(first.contacts[0]!.lastInteractionAt).getTime() === callAt.getTime(), "Profile edits replaced the actual interaction timestamp.");
    const last = await listContacts({ db: app.db }, { businessId, userId, limit: 10, offset: 100 });
    assert(last.contacts.length === 1 && !last.pagination.hasNext && last.pagination.total === 101, "The last page was truncated or miscounted.");
    const search = await listContacts({ db: app.db }, { businessId, userId, search: "Needle", limit: 10 });
    assert(search.contacts.length === 1 && search.pagination.total === 1 && search.contacts[0]?.id === ids[100], "Search failed full-set or tenant isolation.");
    let denied = false; try { await listContacts({ db: app.db }, { businessId: foreignId, userId }); } catch { denied = true; }
    assert(denied, "Foreign contact enumeration was permitted.");
    let linkedRejected = false;
    try { await deleteContact({ db: app.db }, { businessId, userId, contactId: ids[100]! }); } catch (error) { linkedRejected = (error as { status?: number }).status === 409; }
    assert(linkedRejected, "A contact with linked call history was deleted.");
    assert(await deleteContact({ db: app.db }, { businessId, userId, contactId: ids[0]! }), "Standalone contact was not deleted.");
    const remaining = await listContacts({ db: app.db }, { businessId, userId, limit: 100 });
    assert(remaining.pagination.total === 100 && !remaining.contacts.some(contact => contact.id === ids[0]), "Contact deletion left an anonymized row behind.");
    assert(!await deleteContact({ db: app.db }, { businessId, userId, contactId: ids[0]! }), "Repeated deletion did not report a missing contact.");
    let foreignDeleteDenied = false;
    try { await deleteContact({ db: app.db }, { businessId: foreignId, userId, contactId: ids[100]! }); } catch { foreignDeleteDenied = true; }
    assert(foreignDeleteDenied, "Foreign contact deletion was authorized.");
    console.log(JSON.stringify({ standaloneDeletion: true, linkedHistoryPreserved: true, foreignDeletionDenied: true, fullTenantPagination: true, fullSetSearch: true, lastInteractionOrder: true, profileEditsNotActivity: true, tenantIsolation: true }));
  } finally {
    for (const id of [businessId, foreignId]) await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, tx => tx.delete(businesses).where(eq(businesses.id,id)));
    await auth.db.delete(users).where(eq(users.id,userId)); await Promise.all([auth.pool.end(),worker.pool.end(),app.pool.end()]);
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
