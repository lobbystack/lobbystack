import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { businesses, businessHours, businessInvitations, businessMemberships, createDatabaseClient, services, staff, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { findAvailability } from "./booking";
import { acceptInvitation, createBusiness, inviteMember, listUserBusinesses, previewInvitation, removeMember, revokeInvitation, updateBusinessInTransaction } from "./tenancy";

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

describe.skipIf(!client)("business currency", () => {
  it("keeps the prices people read when the currency changes, and refuses a code that isn't ISO 4217", async () => {
    await rollbackTest(async (tx) => {
      const businessId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Studio", timezone: "America/New_York", currency: "USD", businessType: "test", telemetryEnabled: false });
      await tx.insert(services).values([
        { businessId, name: "Cut", slug: "cut", durationMinutes: 30, priceType: "fixed", priceMinor: 4000 },
        { businessId, name: "Colour", slug: "colour", durationMinutes: 60, priceType: "range", priceMinor: 4050, priceMaxMinor: 9999 },
        { businessId, name: "Consult", slug: "consult", durationMinutes: 15, priceType: "in_person" },
      ]);
      const prices = async () => (await tx.select({ name: services.name, priceMinor: services.priceMinor, priceMaxMinor: services.priceMaxMinor }).from(services).where(eq(services.businessId, businessId)).orderBy(services.name)).map((row) => [row.name, row.priceMinor, row.priceMaxMinor]);

      // USD 40.00 is JPY 40; amounts finer than a yen round.
      await updateBusinessInTransaction(tx, { businessId, currency: "JPY" });
      expect(await prices()).toEqual([["Colour", 41, 100], ["Consult", null, null], ["Cut", 40, null]]);
      await updateBusinessInTransaction(tx, { businessId, currency: "KWD" });
      expect(await prices()).toEqual([["Colour", 41000, 100000], ["Consult", null, null], ["Cut", 40000, null]]);
      // RSD has two decimals, like EUR.
      await updateBusinessInTransaction(tx, { businessId, currency: "RSD" });
      await updateBusinessInTransaction(tx, { businessId, currency: "EUR" });
      expect(await prices()).toEqual([["Colour", 4100, 10000], ["Consult", null, null], ["Cut", 4000, null]]);

      await expect(updateBusinessInTransaction(tx, { businessId, currency: "ABC" })).rejects.toMatchObject({ status: 400 });
      expect((await tx.select({ currency: businesses.currency }).from(businesses).where(eq(businesses.id, businessId)))[0]?.currency).toBe("EUR");
    });
  });
});

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
      const slots = await findAvailability({ db: tx as unknown as Database }, { businessId, serviceId: service!.id, startsAt: "2030-01-08T14:00:00.000Z" });
      expect(slots.length).toBeGreaterThan(0);
    });
  });

  it("gives a new business the self-hosted mode on a self-hosted server, and cloud otherwise", async () => {
    for (const [env, expected] of [["self_hosted_standard", "self_hosted_standard"], ["cloud", "cloud"], ["development", "cloud"], ["", "cloud"], ["production", "cloud"]] as const) {
      vi.stubEnv("DEPLOYMENT_MODE", env);
      try {
        await rollbackTest(async (tx) => {
          const userId = randomUUID();
          const email = `${userId}@example.invalid`;
          await tx.insert(users).values({ id: userId, email, normalizedEmail: email, name: "Sam Owner" });
          await tx.execute(sql`set local role lobbystack_app`);
          const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Northside Plumbing", timezone: "America/Toronto", businessType: "service_company" });
          await tx.execute(sql`reset role`);
          const [business] = await tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId));
          expect(business?.deploymentMode).toBe(expected);
        });
      } finally {
        vi.unstubAllEnvs();
      }
    }
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
      await expect(accept(gone!, spareForGone)).rejects.toMatchObject({ status: 409, message: "Invitation is invalid or expired." });
      await expect(accept(alt!, sentByGone)).rejects.toMatchObject({ status: 409, message: "Invitation is invalid or expired." });
      await tx.execute(sql`reset role`);
      const revoked = await tx.select({ status: businessInvitations.status }).from(businessInvitations).where(and(eq(businessInvitations.businessId, businessId), eq(businessInvitations.status, "revoked")));
      expect(revoked).toHaveLength(2);
    });
  });

  it("refuses a viewer who invites, removes a member or revokes an invitation", async () => {
    await rollbackTest(async (tx) => {
      const { context, businessId, people: [owner, viewer, admin], invite, accept, listMembers } = await seedTeam(tx, ["Ana", "Vic", "Ben"]);
      await accept(viewer!, await invite(owner!.id, viewer!.email, "viewer"));
      await accept(admin!, await invite(owner!.id, admin!.email, "business_admin"));
      const pending = await inviteMember(context, { userId: owner!.id, businessId, email: "later@example.invalid", role: "viewer" });
      const adminMembership = (await listMembers(owner!.id)).find((row) => row.user_id === admin!.id)!;

      await expect(inviteMember(context, { userId: viewer!.id, businessId, email: "friend@example.invalid", role: "business_admin" })).rejects.toMatchObject({ status: 403 });
      await expect(removeMember(context, { userId: viewer!.id, businessId, membershipId: adminMembership.membership_id })).rejects.toMatchObject({ status: 403 });
      await expect(revokeInvitation(context, { userId: viewer!.id, businessId, invitationId: pending.invitationId })).rejects.toMatchObject({ status: 403 });
    });
  });

  it("previews an expired invitation as expired and refuses to accept it", async () => {
    await rollbackTest(async (tx) => {
      const { context, people: [owner, invitee], invite, accept } = await seedTeam(tx, ["Ana", "Ivy"]);
      const token = await invite(owner!.id, invitee!.email, "viewer");
      await tx.execute(sql`reset role`);
      await tx.update(businessInvitations).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(businessInvitations.tokenHash, hash(token)));
      await tx.execute(sql`set local role lobbystack_app`);

      await expect(previewInvitation(context, { tokenHash: hash(token) })).resolves.toMatchObject({ expired: true, status: "pending" });
      await expect(accept(invitee!, token)).rejects.toMatchObject({ status: 409 });
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

  it("refuses to remove a member twice or to remove the last owner", async () => {
    await rollbackTest(async (tx) => {
      const { context, businessId, people: [owner, viewer], invite, accept, listMembers } = await seedTeam(tx, ["Ana", "Ben"]);
      await accept(viewer!, await invite(owner!.id, viewer!.email, "viewer"));
      const members = await listMembers(owner!.id);
      const viewerMembership = members.find((row) => row.user_id === viewer!.id)!.membership_id;
      const ownerMembership = members.find((row) => row.user_id === owner!.id)!.membership_id;
      await removeMember(context, { userId: owner!.id, businessId, membershipId: viewerMembership });
      await expect(removeMember(context, { userId: owner!.id, businessId, membershipId: viewerMembership })).rejects.toMatchObject({ status: 404 });
      await expect(removeMember(context, { userId: owner!.id, businessId, membershipId: ownerMembership })).rejects.toMatchObject({ status: 409, code: "final_owner" });
    });
  });
});
