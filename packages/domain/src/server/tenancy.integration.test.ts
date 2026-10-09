import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businessHours, businessInvitations, businessMemberships, createDatabaseClient, services, staff, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { findAvailability } from "./booking";
import { acceptInvitation, createBusiness, inviteMember, listUserBusinesses, removeMember } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Reliability integration tests require a dedicated local test database.");
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

describe.skipIf(!client)("createBusiness", () => {
  it("gives a new business a default staff member so it can take bookings", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      const email = `${userId}@example.invalid`;
      await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Northside Plumbing", timezone: "America/Toronto", businessType: "service_company" });
      await tx.execute(sql`reset role`);

      const members = await tx.select({ name: staff.name, active: staff.active }).from(staff).where(eq(staff.businessId, businessId));
      expect(members).toEqual([{ name: "Northside Plumbing", active: true }]);

      await tx.insert(businessHours).values({ businessId, dayOfWeek: 2, openMinutes: 8 * 60, closeMinutes: 17 * 60 });
      const [service] = await tx.insert(services).values({ businessId, name: "Drain cleaning", slug: "drain-cleaning", durationMinutes: 60 }).returning({ id: services.id });
      // Tuesday 2030-01-08 at 09:00 in Toronto.
      const slots = await findAvailability({ db: tx as unknown as Database }, { businessId, serviceId: service!.id, startsAt: "2030-01-08T14:00:00.000Z", timezone: "America/Toronto" });
      expect(slots.length).toBeGreaterThan(0);
    });
  });

  it("lists each business with its settings in one query", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      const email = `${userId}@example.invalid`;
      await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
      await tx.execute(sql`set local role lobbystack_app`);
      const db = tx as unknown as Database;
      const first = await createBusiness({ db }, { userId, name: "Alpha Dental", timezone: "America/Toronto", businessType: "clinic" });
      const second = await createBusiness({ db }, { userId, name: "Beta Plumbing", timezone: "Europe/Belgrade", businessType: "service_company" });

      expect(await listUserBusinesses(db, userId)).toEqual([
        expect.objectContaining({ businessId: first.businessId, role: "business_owner", active: false, timezone: "America/Toronto", businessType: "clinic", defaultLocale: "en", websiteUrl: null, onboardingStage: "website", createdAt: expect.stringMatching(/Z$/) }),
        expect.objectContaining({ businessId: second.businessId, active: true, timezone: "Europe/Belgrade", businessType: "service_company" }),
      ]);
    });
  });

  it("stops one account at 10 owned businesses", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      const email = `${userId}@example.invalid`;
      await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
      await tx.execute(sql`set local role lobbystack_app`);
      const context = { db: tx as unknown as Database };
      for (let index = 0; index < 10; index++) {
        await createBusiness(context, { userId, name: `Shop ${index}`, timezone: "UTC", businessType: "test" });
      }
      await expect(createBusiness(context, { userId, name: "Shop 11", timezone: "UTC", businessType: "test" })).rejects.toMatchObject({ status: 403 });
    });
  });
});

describe.skipIf(!client)("team membership", () => {
  const hash = (token: string) => createHash("sha256").update(token).digest("hex");

  /** Seeds verified users as the migrator, then switches to the app role and creates the owner's business. */
  async function seedTeam(tx: DatabaseTransaction, names: string[]) {
    const people = [];
    for (const name of names) {
      const id = randomUUID();
      const email = `${id}@example.invalid`;
      await tx.insert(users).values({ id, email, normalizedEmail: email, name, emailVerified: true });
      people.push({ id, email });
    }
    await tx.execute(sql`set local role lobbystack_app`);
    const context = { db: tx as unknown as Database };
    const owner = people[0]!;
    const { businessId } = await createBusiness(context, { userId: owner.id, name: "Team Dental", timezone: "UTC", businessType: "dental" });
    const invite = async (fromUserId: string, email: string, role: "business_admin" | "viewer") => (await inviteMember(context, { userId: fromUserId, businessId, email, role })).token;
    const accept = (person: { id: string; email: string }, token: string) => acceptInvitation(context, { userId: person.id, tokenHash: hash(token), email: person.email, emailVerified: true });
    const listMembers = async (userId: string) => (await withBusinessTransaction(context.db, { userId, businessId, actorType: "operator" }, (inner) => inner.execute<{ membership_id: string; user_id: string; role: string }>(sql`select membership_id, user_id, role from app.list_business_members(${businessId}::uuid)`))).rows;
    return { context, businessId, people, invite, accept, listMembers };
  }

  it("lists other active members to the owner, and removing a member revokes their pending invitations", async () => {
    await rollbackTest(async (tx) => {
      const { context, businessId, people: [owner, admin, gone, alt], invite, accept, listMembers } = await seedTeam(tx, ["Ana", "Ben", "Gil", "Alt"]);
      await accept(admin!, await invite(owner!.id, admin!.email, "business_admin"));
      await accept(gone!, await invite(owner!.id, gone!.email, "business_admin"));
      const sentByGone = await invite(gone!.id, alt!.email, "business_admin");
      const spareForGone = await invite(owner!.id, gone!.email, "business_admin");

      const goneMembership = (await listMembers(owner!.id)).find((row) => row.user_id === gone!.id)!;
      await removeMember(context, { userId: owner!.id, businessId, membershipId: goneMembership.membership_id });

      expect((await listMembers(owner!.id)).map((row) => row.user_id).sort()).toEqual([owner!.id, admin!.id].sort());
      await expect(accept(gone!, spareForGone)).rejects.toThrow("Invitation is invalid or expired.");
      await expect(accept(alt!, sentByGone)).rejects.toThrow("Invitation is invalid or expired.");
      await tx.execute(sql`reset role`);
      const revoked = await tx.select({ status: businessInvitations.status }).from(businessInvitations).where(and(eq(businessInvitations.businessId, businessId), eq(businessInvitations.status, "revoked")));
      expect(revoked).toHaveLength(2);
    });
  });

  it("refuses an invitation accepted by an account with another or unverified email", async () => {
    await rollbackTest(async (tx) => {
      const { context, people: [owner, invitee, stranger], invite, accept } = await seedTeam(tx, ["Ana", "Alice", "Mallory"]);
      const token = await invite(owner!.id, invitee!.email, "business_admin");
      await expect(accept(stranger!, token)).rejects.toMatchObject({ status: 403 });
      await expect(acceptInvitation(context, { userId: invitee!.id, tokenHash: hash(token), email: invitee!.email, emailVerified: false })).rejects.toMatchObject({ status: 403 });
      await expect(accept(invitee!, token)).resolves.toMatchObject({ role: "business_admin" });
    });
  });

  it("keeps an owner's role when they accept a viewer invitation to their own email", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, people: [owner, admin], invite, accept } = await seedTeam(tx, ["Ana", "Ben"]);
      await accept(admin!, await invite(owner!.id, admin!.email, "business_admin"));
      await expect(accept(owner!, await invite(admin!.id, owner!.email, "viewer"))).resolves.toEqual({ businessId, role: "business_owner" });
      await tx.execute(sql`reset role`);
      const [membership] = await tx.select({ role: businessMemberships.role, status: businessMemberships.status }).from(businessMemberships).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.userId, owner!.id)));
      expect(membership).toEqual({ role: "business_owner", status: "active" });
    });
  });
});
