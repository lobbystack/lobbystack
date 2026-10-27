import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, businesses, businessInvitations, businessMemberships, createDatabaseClient, listSchedulerBusinesses, onboardingPhoneVerifications, outboxMessages, partnerBusinessOpens, partnerMembers, services, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import type { PartnerAccessLevel } from "@lobbystack/shared";

import { forgetCachedBrands } from "./brands";
import { capabilityNames, currentPartnerOpen, HOST_BRAND_SCOPE, leavePartnerBusiness, listPartnerAccess, openPartnerBusiness, PARTNER_OPEN_LIFETIME_MS, requireBusinessAccess, type BrandScope, type Capability } from "./businessAccess";
import { getActiveOnboardingState } from "./onboarding";
import { acceptPartnerInvitation, createPartnerBusiness, hashPartnerToken, invitePartnerMember, removePartnerMember, signUpPartner, type PartnerMemberActor } from "./partners";
import { startOnboardingPhoneVerification, startOperatorPhoneVerification } from "./phoneVerification";
import { createApiKey } from "./publicApi/apiKeys";
import { acceptInvitation, createBusiness, inviteMember, listUserBusinesses, readActiveBusinessId, readBusinessCapabilities, switchWorkspace, updateBusiness } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner access integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  // The cloud keeps signup invite-only by default.
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

type Person = { userId: string; email: string };

/** Accounts made as the migrator; every call after this runs as the app role. */
async function people(tx: DatabaseTransaction, count: number): Promise<Person[]> {
  const made = Array.from({ length: count }, () => {
    const userId = randomUUID();
    return { userId, email: `${userId}@example.invalid` };
  });
  await tx.execute(sql`reset role`);
  await tx.insert(users).values(made.map((person) => ({ id: person.userId, email: person.email, normalizedEmail: person.email, name: `Person ${person.userId.slice(0, 4)}`, emailVerified: true })));
  await tx.execute(sql`set local role lobbystack_app`);
  return made;
}

/** Reads or writes as the migrator, then goes back to the app role. */
async function asMigrator<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/**
 * Runs with another login identity, as the worker, the dispatcher or the
 * admin's own session do, then goes back to the app role. Security-definer
 * functions trust session_user, so this switches it rather than the role.
 */
async function asSession<T>(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker" | "lobbystack_dispatcher", run: () => Promise<T>): Promise<T> {
  await tx.execute(sql.raw(`set local session authorization ${role}`));
  try {
    return await run();
  } finally {
    await tx.execute(sql`reset session authorization`);
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** A refusal's error, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

/** The link token in the email queued for an invitation. */
async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** A partner signed up by its owner, with a member on its team. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, member] = await people(tx, 2);
  const context = { db: tx as unknown as Database };
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  const { invitationId } = await invitePartnerMember(context, ownerActor, { email: member!.email, role: "member" });
  await acceptPartnerInvitation(context, { userId: member!.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: member!.email, emailVerified: true });
  return { context, partnerId, owner: owner!, ownerActor, member: member!, brand: { kind: "partner", partnerId } satisfies BrandScope };
}

/** A business the partner created for this person, who accepted the invitation and owns it. */
async function ownedPartnerBusiness(tx: DatabaseTransaction, input: { actor: PartnerMemberActor; owner: Person; name: string; accessLevel?: PartnerAccessLevel }): Promise<string> {
  const context = { db: tx as unknown as Database };
  const { businessId, invitationId } = await createPartnerBusiness(context, input.actor, { name: input.name, timezone: "America/Toronto", businessType: "dental", accessLevel: input.accessLevel ?? "full", ownerEmail: input.owner.email });
  await acceptInvitation(context, { userId: input.owner.userId, tokenHash: hash(await linkToken(tx, invitationId)), email: input.owner.email, emailVerified: true });
  return businessId;
}

/** The person's access to a business, read on a brand's domain in the business's own transaction. */
async function access(tx: DatabaseTransaction, input: { userId: string; businessId: string; brand: BrandScope; capability?: Capability; minimumRole?: "business_admin" | "business_owner" }) {
  return await withBusinessTransaction(tx as unknown as Database, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (inner) => await requireBusinessAccess(inner, input));
}

async function grants(tx: DatabaseTransaction, input: { userId: string; businessId: string; brand: BrandScope }): Promise<Capability[]> {
  const found = await access(tx, input);
  return capabilityNames.filter((capability) => found.can(capability));
}

/** Runs as the person in the business's RLS context, as an operator route does. */
async function asOperator<T>(tx: DatabaseTransaction, input: { userId: string; businessId: string }, run: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await withBusinessTransaction(tx as unknown as Database, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, run);
}

/** What row-level security shows the person of the business: its row, its services and its audit log. */
async function visibleRows(tx: DatabaseTransaction, input: { userId: string; businessId: string }) {
  return await asOperator(tx, input, async (inner) => ({
    businesses: (await inner.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, input.businessId))).length,
    services: (await inner.select({ id: services.id }).from(services).where(eq(services.businessId, input.businessId))).length,
    auditLogs: (await inner.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.businessId, input.businessId))).length,
  }));
}

async function addService(tx: DatabaseTransaction, input: { userId: string; businessId: string }) {
  return await asOperator(tx, input, async (inner) => await inner.insert(services).values({ businessId: input.businessId, name: "Cleaning", slug: `cleaning-${randomUUID()}`, durationMinutes: 30 }).returning({ id: services.id }));
}

/** Moves the person's open of the business into the past, as if its time ran out. */
async function expireOpen(tx: DatabaseTransaction, input: { userId: string; businessId: string }) {
  await asMigrator(tx, async () => await tx.update(partnerBusinessOpens).set({ openedAt: sql`now() - interval '9 hours'`, expiresAt: sql`now() - interval '1 hour'` }).where(and(eq(partnerBusinessOpens.businessId, input.businessId), eq(partnerBusinessOpens.userId, input.userId))));
}

const notHere = { status: 403, code: "forbidden", message: "You do not have access to this business." };
const notFound = { status: 404, code: "business_not_found" };

describe.skipIf(!client)("opening a partner's business", () => {
  it("records each open in the business's audit log with who opened it, when and until when, and lets the member in until then", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      const member = { userId: acme.member.userId, businessId };

      // Before an open, the partner's member reaches nothing in the business, and RLS agrees.
      await expect(access(tx, { ...member, brand: acme.brand })).rejects.toMatchObject(notHere);
      expect(await visibleRows(tx, member)).toEqual({ businesses: 0, services: 0, auditLogs: 0 });
      expect(await refusal(addService(tx, member))).toMatchObject({ code: "42501" });
      await expect(updateBusiness(acme.context, { ...member, name: "Harbor Dental & Co" })).rejects.toMatchObject(notHere);

      const before = Date.now();
      const { expiresAt } = await openPartnerBusiness(acme.context, member);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + PARTNER_OPEN_LIFETIME_MS);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + PARTNER_OPEN_LIFETIME_MS);
      const opens = async () => await asMigrator(tx, async () => await tx.select({ actorUserId: auditLogs.actorUserId, entityType: auditLogs.entityType, entityId: auditLogs.entityId, payload: auditLogs.payload, createdAt: auditLogs.createdAt }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "partner.business_opened"))));
      expect(await opens()).toEqual([{ actorUserId: acme.member.userId, entityType: "business", entityId: businessId, payload: { partnerId: acme.partnerId, partnerRole: "member", openedAt: expect.stringMatching(/Z$/), expiresAt: expiresAt.toISOString(), partnerName: expect.any(String) }, createdAt: expect.any(Date) }]);
      // The business's own owner reads who opened it in its audit log.
      expect(await asOperator(tx, { userId: client!.userId, businessId }, async (inner) => await inner.select({ actorUserId: auditLogs.actorUserId }).from(auditLogs).where(eq(auditLogs.eventType, "partner.business_opened")))).toEqual([{ actorUserId: acme.member.userId }]);

      // Until then the member works inside it with full access, as RLS lets them.
      expect(await access(tx, { ...member, brand: acme.brand })).toMatchObject({ via: "partner", role: "business_admin", partnerRole: "member", partnerId: acme.partnerId, accessLevel: "full" });
      expect(await addService(tx, member)).toHaveLength(1);
      expect(await visibleRows(tx, member)).toMatchObject({ businesses: 1, services: 1 });
      await updateBusiness(acme.context, { ...member, name: "Harbor Dental & Co" });
      expect((await asMigrator(tx, async () => await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId))))[0]).toEqual({ name: "Harbor Dental & Co" });
      // The partner's domain opens the dashboard on it.
      expect(await readActiveBusinessId(acme.context.db, { userId: acme.member.userId, brand: acme.brand })).toBe(businessId);

      // Opening it again starts the time over, and the audit log keeps both opens.
      const again = await openPartnerBusiness(acme.context, member);
      expect(again.expiresAt.getTime()).toBeGreaterThanOrEqual(expiresAt.getTime());
      // Both rows share the fixture transaction's created_at, so they're compared by expiry.
      expect((await opens()).map((row) => String(row.payload?.expiresAt)).sort()).toEqual([expiresAt.toISOString(), again.expiresAt.toISOString()]);
      expect(await asMigrator(tx, async () => await tx.select({ expiresAt: partnerBusinessOpens.expiresAt }).from(partnerBusinessOpens).where(eq(partnerBusinessOpens.businessId, businessId)))).toEqual([{ expiresAt: again.expiresAt }]);

      // Going back to the console ends the open at once, but only the open the tab saw begin: a newer one stays.
      await openPartnerBusiness(acme.context, { ...member, openedBy: { name: "Mia" } });
      const seen = (await currentPartnerOpen(acme.context, member))!;
      await asMigrator(tx, async () => await tx.update(partnerBusinessOpens).set({ openedAt: new Date(seen.openedAt.getTime() + 1000) }).where(and(eq(partnerBusinessOpens.businessId, businessId), eq(partnerBusinessOpens.userId, member.userId))));
      expect(await leavePartnerBusiness(acme.context, { ...member, openedAt: seen.openedAt })).toEqual({ left: false });
      expect(await access(tx, { ...member, brand: acme.brand })).toMatchObject({ via: "partner" });
      const newer = (await currentPartnerOpen(acme.context, member))!;
      expect(await leavePartnerBusiness(acme.context, { ...member, openedAt: newer.openedAt })).toEqual({ left: true });
      await expect(access(tx, { ...member, brand: acme.brand })).rejects.toMatchObject(notHere);
      expect(await currentPartnerOpen(acme.context, member)).toBeNull();
      expect(await leavePartnerBusiness(acme.context, member)).toEqual({ left: false });
      // The owner sees who came and went by name and the partner, never their email or role.
      const visits = await asOperator(tx, { userId: client!.userId, businessId }, async (inner) => await listPartnerAccess(inner, { businessId }));
      expect(visits.map((visit) => visit.kind).sort()).toEqual(["left", "opened", "opened", "opened"]);
      expect(visits.filter((visit) => visit.name === "Mia").map((visit) => visit.kind).sort()).toEqual(["left", "opened"]);
      for (const visit of visits) expect(Object.keys(visit).sort()).toEqual(["at", "id", "kind", "name", "partnerName"]);
      expect(visits.every((visit) => visit.partnerName === "Acme Reception")).toBe(true);

      // Once it runs out, nothing reaches the business again.
      await openPartnerBusiness(acme.context, member);
      await expireOpen(tx, member);
      await expect(access(tx, { ...member, brand: acme.brand })).rejects.toMatchObject(notHere);
      expect(await visibleRows(tx, member)).toEqual({ businesses: 0, services: 0, auditLogs: 0 });
      expect(await refusal(addService(tx, member))).toMatchObject({ code: "42501" });
    });
  });

  it("gives full access whatever the business's level, never billing, API keys or MCP, and only on the partner's domains", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [client] = await people(tx, 1);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Pier Clinic", accessLevel: "activity" });
      const member = { userId: acme.member.userId, businessId };
      await openPartnerBusiness(acme.context, member);

      // The business's own operators get only the activity; the partner's member gets full access.
      expect(await grants(tx, { userId: client!.userId, businessId, brand: acme.brand })).toEqual(["activity"]);
      expect(await grants(tx, { ...member, brand: acme.brand })).toEqual(["activity", "setup", "team"]);
      expect(await readBusinessCapabilities(acme.context.db, member)).toEqual(["activity", "setup", "team"]);
      const outside = { status: 403, message: "You can't do that in this business." };
      for (const capability of ["billing", "api_keys", "mcp"] as const) {
        await expect(access(tx, { ...member, brand: acme.brand, capability })).rejects.toMatchObject(outside);
      }
      await expect(createApiKey(acme.context, { ...member, name: "CRM", scopes: ["calls:read"] })).rejects.toMatchObject(outside);
      // An admin's role, never an owner's.
      await expect(access(tx, { ...member, brand: acme.brand, capability: "setup", minimumRole: "business_admin" })).resolves.toBeDefined();
      await expect(access(tx, { ...member, brand: acme.brand, minimumRole: "business_owner" })).rejects.toMatchObject(notHere);
      // The business shows only on its partner's domains.
      await expect(access(tx, { ...member, brand: HOST_BRAND_SCOPE })).rejects.toMatchObject(notHere);
      await expect(access(tx, { ...member, brand: bright.brand })).rejects.toMatchObject(notHere);
      await expect(switchWorkspace(acme.context, { ...member, brand: HOST_BRAND_SCOPE })).rejects.toMatchObject(notHere);
      await expect(switchWorkspace(acme.context, { ...member, brand: acme.brand })).resolves.toBeUndefined();
    });
  });

  it("refuses another partner's businesses, direct businesses and anyone off the partner's team", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [client, outsider] = await people(tx, 2);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      const { businessId: direct } = await createBusiness(acme.context, { userId: client!.userId, name: "Corner Shop", timezone: "UTC", businessType: "test" });

      await expect(openPartnerBusiness(acme.context, { userId: bright.member.userId, businessId })).rejects.toMatchObject(notFound);
      await expect(openPartnerBusiness(acme.context, { userId: bright.owner.userId, businessId })).rejects.toMatchObject(notFound);
      await expect(openPartnerBusiness(acme.context, { userId: outsider!.userId, businessId })).rejects.toMatchObject(notFound);
      await expect(openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: direct })).rejects.toMatchObject(notFound);
      await expect(openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: randomUUID() })).rejects.toMatchObject(notFound);
      // Bright's console can't open Acme's business, even for someone on both teams.
      await expect(openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId, partnerId: bright.partnerId })).rejects.toMatchObject(notFound);
      expect(await asMigrator(tx, async () => await tx.select().from(partnerBusinessOpens).where(eq(partnerBusinessOpens.businessId, businessId)))).toEqual([]);
      await expect(access(tx, { userId: bright.member.userId, businessId, brand: acme.brand })).rejects.toMatchObject(notHere);
      expect(await visibleRows(tx, { userId: bright.member.userId, businessId })).toEqual({ businesses: 0, services: 0, auditLogs: 0 });

      // The database refuses such an open too, whoever writes it, and an operator writes none at all.
      const writeOpen = (userId: string, partnerId: string, actorType: "operator" | "system") => withBusinessTransaction(acme.context.db, { userId, businessId, actorType }, async (inner) => await inner.insert(partnerBusinessOpens).values({ businessId, userId, partnerId, expiresAt: new Date(Date.now() + 60_000) }));
      expect(await refusal(writeOpen(bright.member.userId, bright.partnerId, "system"))).toMatchObject({ code: "42501" });
      expect(await refusal(writeOpen(bright.member.userId, acme.partnerId, "system"))).toMatchObject({ code: "42501" });
      expect(await refusal(writeOpen(acme.member.userId, acme.partnerId, "operator"))).toMatchObject({ code: "42501" });
      await expect(openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId, partnerId: acme.partnerId.toUpperCase() })).resolves.toBeDefined();
    });
  });

  it("ends the access at once when the member leaves the partner's team, or the business leaves the partner", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const harbor = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      const pier = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Pier Clinic" });
      await openPartnerBusiness(acme.context, { userId: acme.owner.userId, businessId: harbor });
      await openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: pier });

      // Releasing a business runs as the system actor and takes away its partner.
      await withBusinessTransaction(acme.context.db, { userId: client!.userId, businessId: harbor, actorType: "system" }, async (inner) => await inner.update(businesses).set({ partnerId: null }).where(eq(businesses.id, harbor)));
      await expect(access(tx, { userId: acme.owner.userId, businessId: harbor, brand: acme.brand })).rejects.toMatchObject(notHere);
      await expect(access(tx, { userId: acme.owner.userId, businessId: harbor, brand: HOST_BRAND_SCOPE })).rejects.toMatchObject(notHere);
      expect(await visibleRows(tx, { userId: acme.owner.userId, businessId: harbor })).toEqual({ businesses: 0, services: 0, auditLogs: 0 });

      await expect(access(tx, { userId: acme.member.userId, businessId: pier, brand: acme.brand })).resolves.toMatchObject({ via: "partner" });
      const [{ memberId }] = await asMigrator(tx, async () => await tx.select({ memberId: partnerMembers.id }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, acme.partnerId), eq(partnerMembers.userId, acme.member.userId)))) as [{ memberId: string }];
      await removePartnerMember(acme.context, acme.ownerActor, { memberId });
      await expect(access(tx, { userId: acme.member.userId, businessId: pier, brand: acme.brand })).rejects.toMatchObject(notHere);
      expect(await visibleRows(tx, { userId: acme.member.userId, businessId: pier })).toEqual({ businesses: 0, services: 0, auditLogs: 0 });
      expect(await listUserBusinesses(acme.context.db, acme.member.userId, acme.brand)).toEqual([]);
    });
  });

  it("stops the invitations a member sent through an open from working once they leave the partner's team", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client, kept, dropped] = await people(tx, 3);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      const member = { userId: acme.member.userId, businessId };
      await openPartnerBusiness(acme.context, member);
      const first = await inviteMember(acme.context, { ...member, email: kept!.email, role: "viewer" });
      const second = await inviteMember(acme.context, { ...member, email: dropped!.email, role: "business_admin" });
      // While the member is on the partner's team, what they sent works.
      await acceptInvitation(acme.context, { userId: kept!.userId, tokenHash: hash(await linkToken(tx, first.invitationId)), email: kept!.email, emailVerified: true });

      const [{ memberId }] = await asMigrator(tx, async () => await tx.select({ memberId: partnerMembers.id }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, acme.partnerId), eq(partnerMembers.userId, acme.member.userId)))) as [{ memberId: string }];
      await removePartnerMember(acme.context, acme.ownerActor, { memberId });
      // Once they're off it, an invitation they sent can't put someone on the team, such as an address of their own.
      expect(await refusal(acceptInvitation(acme.context, { userId: dropped!.userId, tokenHash: hash(await linkToken(tx, second.invitationId)), email: dropped!.email, emailVerified: true }))).toMatchObject({ status: 409 });
      const team = await asMigrator(tx, async () => await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.status, "active"))));
      expect(team.map((row) => row.userId).sort()).toEqual([client!.userId, kept!.userId].sort());
    });
  });
});

describe.skipIf(!client)("the business's own team", () => {
  it("never lists a partner member who opened the business, or sends them its alerts, while letting them read and run the team", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      const member = { userId: acme.member.userId, businessId };
      const team = (userId: string) => asOperator(tx, { userId, businessId }, async (inner) => (await inner.execute<{ user_id: string; role: string }>(sql`select user_id, role from app.list_business_members(${businessId}::uuid)`)).rows);

      // Without an open the member can't read the team list at all.
      expect(await team(acme.member.userId)).toEqual([]);
      await expect(inviteMember(acme.context, { ...member, email: "front-desk@example.invalid", role: "viewer" })).rejects.toMatchObject(notHere);

      await openPartnerBusiness(acme.context, member);
      expect(await team(acme.member.userId)).toEqual([{ user_id: client!.userId, role: "business_owner" }]);
      expect(await team(client!.userId)).toEqual([{ user_id: client!.userId, role: "business_owner" }]);
      // Full access includes the team, so they can invite someone onto it, without joining it themselves.
      await inviteMember(acme.context, { ...member, email: "front-desk@example.invalid", role: "viewer" });
      const stored = await asMigrator(tx, async () => ({
        memberships: await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId)),
        invitations: await tx.select({ email: businessInvitations.email, invitedByUserId: businessInvitations.invitedByUserId }).from(businessInvitations).where(and(eq(businessInvitations.businessId, businessId), eq(businessInvitations.role, "viewer"))),
      }));
      expect(stored).toEqual({ memberships: [{ userId: client!.userId }], invitations: [{ email: "front-desk@example.invalid", invitedByUserId: acme.member.userId }] });

      // Alerts go to the business's own team only, and its owner is the owner who joined.
      const asWorker = (query: ReturnType<typeof sql>) => asSession(tx, "lobbystack_worker", async () => await withBusinessTransaction(acme.context.db, { businessId, actorType: "worker" }, async (inner) => (await inner.execute<{ user_id: string }>(query)).rows));
      expect(await asWorker(sql`select user_id from app.resolve_operator_notification_recipients(${businessId}::uuid)`)).toEqual([{ user_id: client!.userId }]);
      expect(await asWorker(sql`select user_id from app.resolve_business_owner_contact(${businessId}::uuid)`)).toEqual([{ user_id: client!.userId }]);
    });
  });

  it("never lets a partner member join the team, through an open, an owner's invitation, or as a new business's owner", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [client] = await people(tx, 1);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      const member = { userId: acme.member.userId, businessId };
      const notOnTeam = { status: 409, code: "partner_member_not_on_team" };
      await openPartnerBusiness(acme.context, member);

      // Through the open the member can invite people onto the team, but not themselves or anyone else on the partner's team.
      expect(await refusal(inviteMember(acme.context, { ...member, email: acme.member.email.toUpperCase(), role: "business_admin" }))).toMatchObject(notOnTeam);
      expect(await refusal(inviteMember(acme.context, { ...member, email: acme.owner.email, role: "viewer" }))).toMatchObject(notOnTeam);
      // Someone on another partner's team is anyone else to this business.
      await inviteMember(acme.context, { ...member, email: bright.member.email, role: "viewer" });

      // The owner doesn't see the partner's team, so their invitation goes out, but accepting it is refused.
      const { invitationId } = await inviteMember(acme.context, { userId: client!.userId, businessId, email: acme.member.email, role: "business_admin" });
      expect(await refusal(acceptInvitation(acme.context, { userId: acme.member.userId, tokenHash: hash(await linkToken(tx, invitationId)), email: acme.member.email, emailVerified: true }))).toMatchObject(notOnTeam);
      const stored = await asMigrator(tx, async () => ({
        memberships: await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId)),
        invitation: (await tx.select({ status: businessInvitations.status }).from(businessInvitations).where(eq(businessInvitations.id, invitationId)))[0],
      }));
      expect(stored).toEqual({ memberships: [{ userId: client!.userId }], invitation: { status: "pending" } });
      const team = await asOperator(tx, { userId: client!.userId, businessId }, async (inner) => (await inner.execute<{ user_id: string }>(sql`select user_id from app.list_business_members(${businessId}::uuid)`)).rows);
      expect(team).toEqual([{ user_id: client!.userId }]);

      // Nor can the partner make someone on its team a business's owner.
      expect(await refusal(createPartnerBusiness(acme.context, acme.ownerActor, { name: "Pier Clinic", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: acme.member.email }))).toMatchObject({ status: 409, code: "owner_on_partner_team" });
      // The database answers only someone on that partner's team.
      const asks = (userId: string) => withBusinessTransaction(acme.context.db, { userId, actorType: "operator" }, async (inner) => (await inner.execute<{ found: boolean }>(sql`select app.is_partner_member_email(${acme.partnerId}::uuid, ${acme.member.email}) as found`)).rows[0]?.found);
      expect(await asks(acme.owner.userId)).toBe(true);
      expect(await asks(client!.userId)).toBe(false);
      expect(await asks(bright.owner.userId)).toBe(false);
    });
  });

  it("keeps alert phones and the owner's onboarding to the business's own team, and lets a partner member verify only for its partner's trial", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Pier Clinic", accessLevel: "activity" });
      const member = { userId: acme.member.userId, businessId };
      await openPartnerBusiness(acme.context, member);

      // SMS alerts go to the team, so the member can't verify a phone for them.
      await expect(startOperatorPhoneVerification(acme.context, { ...member, phoneE164: "+14165550123", countryCode: "CA" })).rejects.toMatchObject(notHere);
      // The phone step lets the member in only while the business is offered its partner's trial number. This one isn't: its owner hasn't finished onboarding.
      const verify = { lookupLineType: async () => "mobile", sendCode: async () => ({ sid: "VE-test" }), checkCode: async () => "approved" };
      await expect(asSession(tx, "lobbystack_app", async () => await startOnboardingPhoneVerification(acme.context, { ...member, phoneE164: "+14165550123", countryCode: "CA" }, verify))).rejects.toMatchObject(notHere);

      // The database lets the open verify the member's own phone, and the application decides when. It never finishes the owner's onboarding.
      const reserve = (userId: string, phone: string) => asSession(tx, "lobbystack_app", async () => (await withBusinessTransaction(acme.context.db, { userId, businessId, actorType: "operator" }, async (inner) => await inner.execute<{ id: string }>(sql`select app.reserve_phone_verification_attempt(${businessId}::uuid, ${userId}::uuid, ${phone}, ${"CA"}, ${null}, ${randomUUID()}) as id`))).rows[0]!.id);
      const complete = (userId: string, attemptId: string) => asSession(tx, "lobbystack_app", async () => (await withBusinessTransaction(acme.context.db, { userId, businessId, actorType: "operator" }, async (inner) => await inner.execute<{ approved: boolean }>(sql`select app.complete_phone_verification(${businessId}::uuid, ${userId}::uuid, ${attemptId}::uuid, ${"approved"}) as approved`))).rows[0]!.approved);
      const pending = async (attemptId: string) => await asMigrator(tx, async () => await tx.update(onboardingPhoneVerifications).set({ status: "pending" }).where(eq(onboardingPhoneVerifications.id, attemptId)));
      const stage = async () => await asMigrator(tx, async () => (await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)))[0]!.stage);
      const memberAttempt = await reserve(acme.member.userId, "+14165550123");
      await pending(memberAttempt);
      expect(await complete(acme.member.userId, memberAttempt)).toBe(true);
      expect(await asMigrator(tx, async () => (await tx.select({ phone: users.phone }).from(users).where(eq(users.id, acme.member.userId)))[0])).toEqual({ phone: "+14165550123" });
      expect(await stage()).toBe("verify_phone");

      // The business's owner still verifies theirs, which finishes their onboarding.
      const ownerAttempt = await reserve(client!.userId, "+14165550124");
      await pending(ownerAttempt);
      expect(await complete(client!.userId, ownerAttempt)).toBe(true);
      expect(await stage()).toBe("complete");

      // Once the member's open runs out, the database refuses them too.
      await expireOpen(tx, member);
      expect(await refusal(reserve(acme.member.userId, "+14165550125"))).toMatchObject({ code: "42501", message: "forbidden" });
    });
  });
});

describe.skipIf(!client)("database functions that join memberships", () => {
  it("lists an opened business on the partner's domains, and takes the member past its owner's onboarding to the dashboard", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      const member = { userId: acme.member.userId, businessId };
      expect(await listUserBusinesses(acme.context.db, acme.member.userId, acme.brand)).toEqual([]);

      await openPartnerBusiness(acme.context, member);
      expect(await listUserBusinesses(acme.context.db, acme.member.userId, acme.brand)).toEqual([expect.objectContaining({ businessId, name: "Harbor Dental", role: "business_admin", via: "partner", active: true, partnerAccessLevel: "full", capabilities: ["activity", "setup", "team"] })]);
      expect(await listUserBusinesses(acme.context.db, acme.member.userId, HOST_BRAND_SCOPE)).toEqual([]);
      expect(await listUserBusinesses(acme.context.db, client!.userId, acme.brand)).toEqual([expect.objectContaining({ businessId, role: "business_owner", via: "membership" })]);
      // The owner's onboarding is theirs: they still start at the website, and the member goes to the dashboard.
      expect(await getActiveOnboardingState(acme.context.db, client!.userId, acme.brand)).toMatchObject({ businessId, stage: "website" });
      expect(await getActiveOnboardingState(acme.context.db, acme.member.userId, acme.brand)).toEqual({ businessId, stage: "complete", steps: [] });
      expect(await getActiveOnboardingState(acme.context.db, acme.member.userId, HOST_BRAND_SCOPE)).toMatchObject({ businessId: null, stage: "create_business" });

      await expireOpen(tx, member);
      expect(await listUserBusinesses(acme.context.db, acme.member.userId, acme.brand)).toEqual([]);
      expect(await readBusinessCapabilities(acme.context.db, member)).toBeNull();
      expect(await getActiveOnboardingState(acme.context.db, acme.member.userId, acme.brand)).toMatchObject({ businessId: null, stage: "create_business" });
    });
  });

  it("counts a partner's open as use for the scheduler, so a business set up before its owner joins gets its jobs", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const { businessId } = await createPartnerBusiness(acme.context, acme.ownerActor, { name: "Harbor Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "activity", ownerEmail: "owner@example.invalid" });
      const active = async () => (await asSession(tx, "lobbystack_dispatcher", async () => await listSchedulerBusinesses(tx as unknown as Database))).find((row) => row.id === businessId)?.active;
      expect(await active()).toBe(false);
      await openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId });
      expect(await active()).toBe(true);
    });
  });
});
