import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, billingAccounts, billingUsageEvents, businesses, businessInvitations, businessMemberships, createDatabaseClient, onboardingNumberClaimEvents, outboxMessages, partnerBusinessOpens, partnerPlatformKeys, phoneNumbers, services, storageObjects, userActiveBusinesses, users, webhookEndpoints, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { planEntitlement, type PartnerAccessLevel } from "@lobbystack/shared";

import { reserveWidgetChatUsageInTransaction } from "./billing";
import { forgetCachedBrands } from "./brands";
import { capabilityNames, HOST_BRAND_SCOPE, openPartnerBusiness, requireBusinessAccess, type BrandScope } from "./businessAccess";
import { loadEntitlement } from "./entitlement";
import { acceptPartnerInvitation, createPartnerBusiness, deletePartnerBusiness, hashPartnerToken, invitePartnerMember, listPartnerBusinesses, partnerReleasedBusinessTo, releaseBusiness, signUpPartner, type PartnerMemberActor } from "./partners";
import { acceptInvitation, inviteMember, listUserBusinesses, readActiveBusinessId } from "./tenancy";
import { correctUsageInTransaction, readAllowanceUsageInTransaction } from "./usage";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner console integration tests require a dedicated local test database.");
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
 * Runs as the worker in the business's context, as the widget chat route and
 * the end of a call do, then goes back to the app role. The actor type trusts
 * the current role, so this switches the session to the worker's.
 */
async function asWorker<T>(tx: DatabaseTransaction, businessId: string, run: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await withBusinessTransaction(tx as unknown as Database, { businessId, actorType: "worker" }, run);
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

/** A partner signed up by its owner, with a member and an admin on its team. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, member, admin] = await people(tx, 3);
  const context = { db: tx as unknown as Database };
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  for (const [person, role] of [[member!, "member"], [admin!, "admin"]] as const) {
    const { invitationId } = await invitePartnerMember(context, ownerActor, { email: person.email, role });
    await acceptPartnerInvitation(context, { userId: person.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: person.email, emailVerified: true });
  }
  return {
    context,
    partnerId,
    owner: owner!,
    ownerActor,
    member: member!,
    memberActor: { kind: "member", partnerId, userId: member!.userId, role: "member" } satisfies PartnerMemberActor,
    adminActor: { kind: "member", partnerId, userId: admin!.userId, role: "admin" } satisfies PartnerMemberActor,
    brand: { kind: "partner", partnerId } satisfies BrandScope,
  };
}

/** A business the partner created for this person, who accepted the invitation and owns it. */
async function ownedPartnerBusiness(tx: DatabaseTransaction, input: { actor: PartnerMemberActor; owner: Person; name: string; accessLevel?: PartnerAccessLevel }): Promise<string> {
  const context = { db: tx as unknown as Database };
  const { businessId, invitationId } = await createPartnerBusiness(context, input.actor, { name: input.name, timezone: "America/Toronto", businessType: "dental", accessLevel: input.accessLevel ?? "full", ownerEmail: input.owner.email });
  await acceptInvitation(context, { userId: input.owner.userId, tokenHash: hash(await linkToken(tx, invitationId)), email: input.owner.email, emailVerified: true });
  return businessId;
}

/** Runs as the person in the business's RLS context, as an operator route does. */
async function asOperator<T>(tx: DatabaseTransaction, input: { userId: string; businessId: string }, run: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await withBusinessTransaction(tx as unknown as Database, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, run);
}

/** What the business used: a finished call of this many seconds, and this many website chats. */
async function use(tx: DatabaseTransaction, businessId: string, input: { voiceSeconds: number; chats: number; at?: Date }) {
  await asWorker(tx, businessId, async (inner) => {
    await correctUsageInTransaction(inner, { businessId, sourceKey: `voice:${randomUUID()}`, usageKind: "voice_seconds", quantity: input.voiceSeconds, recordedAt: input.at });
    for (let chat = 0; chat < input.chats; chat++) await reserveWidgetChatUsageInTransaction(inner, { businessId, conversationId: randomUUID() });
  });
}

/** A phone number no other row holds. */
const phoneNumber = () => `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
const providerPhoneId = () => `PN${randomUUID().replaceAll("-", "")}`;

const notFound = { status: 404, code: "business_not_found" };
const notHere = { status: 403, code: "forbidden", message: "You do not have access to this business." };

describe.skipIf(!client)("usage in the console and in the business", () => {
  it("shows each business's minutes and chats this month to the partner's team, and the business's own dashboard shows them against its allowance", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [harborOwner, pierOwner, brightOwner] = await people(tx, 3);
      const harbor = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: harborOwner!, name: "Harbor Dental" });
      const pier = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: pierOwner!, name: "Pier Clinic", accessLevel: "activity" });
      const beacon = await ownedPartnerBusiness(tx, { actor: bright.ownerActor, owner: brightOwner!, name: "Beacon Vets" });

      await use(tx, harbor, { voiceSeconds: 750, chats: 2 });
      // Last month's usage stays out of this month's count.
      const now = new Date();
      await use(tx, harbor, { voiceSeconds: 300, chats: 0, at: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)) });
      await use(tx, beacon, { voiceSeconds: 60, chats: 1 });

      const periodKey = now.toISOString().slice(0, 7);
      // Anyone on the team sees it, members included, without opening the businesses.
      const listed = await listPartnerBusinesses(acme.context, acme.memberActor);
      expect(listed.map((business) => [business.name, business.usage])).toEqual([
        ["Harbor Dental", { periodKey, voiceSeconds: 750, chats: 2 }],
        ["Pier Clinic", { periodKey, voiceSeconds: 0, chats: 0 }],
      ]);
      expect((await listPartnerBusinesses(bright.context, bright.memberActor)).map((business) => [business.businessId, business.usage.voiceSeconds, business.usage.chats])).toEqual([[beacon, 60, 1]]);

      // The database answers only someone on the partner's team, and only as an operator.
      const usageFor = (userId: string, partnerId: string, actorType: "operator" | "system") => withBusinessTransaction(acme.context.db, { userId, actorType }, async (inner) => (await inner.execute<{ business_id: string }>(sql`select business_id from app.list_partner_business_usage(${partnerId}::uuid, ${periodKey})`)).rows);
      expect(await usageFor(bright.member.userId, acme.partnerId, "operator")).toEqual([]);
      expect(await usageFor(harborOwner!.userId, acme.partnerId, "operator")).toEqual([]);
      expect(await usageFor(acme.member.userId, acme.partnerId, "system")).toEqual([]);
      expect((await usageFor(acme.member.userId, acme.partnerId, "operator")).map((row) => row.business_id).sort()).toEqual([harbor, pier].sort());
      const asWorkerRole = await refusal(asWorker(tx, harbor, async (inner) => await inner.execute(sql`select * from app.list_partner_business_usage(${acme.partnerId}::uuid, ${periodKey})`)));
      expect(asWorkerRole).toMatchObject({ code: "42501" });

      // The business's dashboard shows its usage against loadEntitlement's allowance: none while it's billed outside LobbyStack.
      const dashboard = (userId: string, businessId: string) => asOperator(tx, { userId, businessId }, async (inner) => await readAllowanceUsageInTransaction(inner, { businessId, now }));
      const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
      // Billed outside LobbyStack, Harbor has no package, so no overage either.
      expect(await dashboard(harborOwner!.userId, harbor)).toEqual({ periodKey, resetsAt, voiceSeconds: { used: 750, included: null, blocked: false }, chats: { used: 2, included: null, blocked: false }, overage: null });
      // Row-level security shows the partner's member none of it before an open, and all of it after.
      expect((await dashboard(acme.member.userId, harbor)).voiceSeconds.used).toBe(0);
      await openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: harbor });
      expect(await dashboard(acme.member.userId, harbor)).toEqual(await dashboard(harborOwner!.userId, harbor));
    });
  });
});

describe.skipIf(!client)("releasing a business", () => {
  it("needs an owner or admin of the business's own partner, and an owner who accepted the invitation", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [client] = await people(tx, 1);
      const harbor = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      const { businessId: invited } = await createPartnerBusiness(acme.context, acme.ownerActor, { name: "Pier Clinic", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@pier.invalid" });

      expect(await refusal(releaseBusiness(acme.context, acme.memberActor, { businessId: harbor }))).toMatchObject({ status: 403 });
      expect(await refusal(releaseBusiness(bright.context, bright.ownerActor, { businessId: harbor }))).toMatchObject(notFound);
      // Someone off Acme's team can't act for it by naming it.
      expect(await refusal(releaseBusiness(acme.context, { ...bright.ownerActor, partnerId: acme.partnerId }, { businessId: harbor }))).toMatchObject({ status: 403 });
      expect(await refusal(releaseBusiness(acme.context, acme.ownerActor, { businessId: randomUUID() }))).toMatchObject(notFound);
      // An owner who hasn't accepted the invitation can't take the business over.
      expect(await refusal(releaseBusiness(acme.context, acme.adminActor, { businessId: invited }))).toMatchObject({ status: 409, code: "owner_required" });

      const stillAcmes = await asMigrator(tx, async () => await tx.select({ id: businesses.id, partnerId: businesses.partnerId }).from(businesses).where(inArray(businesses.id, [harbor, invited])));
      expect(stillAcmes.every((business) => business.partnerId === acme.partnerId)).toBe(true);
    });
  });

  it("gives the business to its owner on the host's Free plan, takes it out of the console, and ends the partner's access at once", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const harbor = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental", accessLevel: "activity" });
      const pier = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Pier Clinic" });
      await openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: harbor });
      // Through the open the partner's member invites someone onto the team, and the owner invites someone too.
      await inviteMember(acme.context, { userId: acme.member.userId, businessId: harbor, email: "partner-pick@example.invalid", role: "business_admin" });
      await inviteMember(acme.context, { userId: client!.userId, businessId: harbor, email: "front-desk@example.invalid", role: "viewer" });
      expect(await readActiveBusinessId(acme.context.db, { userId: client!.userId, brand: acme.brand })).toBe(pier);
      expect(await readActiveBusinessId(acme.context.db, { userId: acme.member.userId, brand: acme.brand })).toBe(harbor);

      expect(await releaseBusiness(acme.context, acme.adminActor, { businessId: harbor })).toEqual({ ownerUserId: client!.userId });

      // It's the owner's direct business now, with every capability, on the host's Free plan.
      expect((await listPartnerBusinesses(acme.context, acme.memberActor)).map((business) => business.businessId)).toEqual([pier]);
      expect(await listUserBusinesses(acme.context.db, client!.userId, HOST_BRAND_SCOPE)).toEqual([expect.objectContaining({ businessId: harbor, role: "business_owner", via: "membership", partnerAccessLevel: null, capabilities: [...capabilityNames] })]);
      expect((await listUserBusinesses(acme.context.db, client!.userId, acme.brand)).map((business) => business.businessId)).toEqual([pier]);
      const owned = await asOperator(tx, { userId: client!.userId, businessId: harbor }, async (inner) => ({
        access: await requireBusinessAccess(inner, { userId: client!.userId, businessId: harbor, brand: HOST_BRAND_SCOPE, capability: "billing", minimumRole: "business_owner" }),
        entitlement: await loadEntitlement(inner, harbor),
        account: (await inner.select({ plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, harbor)))[0],
      }));
      expect(owned.access).toMatchObject({ via: "membership", partnerId: null, accessLevel: null });
      expect(owned.entitlement).toEqual(planEntitlement("free_cloud"));
      expect(owned.account).toEqual({ plan: "free_cloud", subscriptionState: null });
      await expect(asOperator(tx, { userId: client!.userId, businessId: harbor }, async (inner) => await requireBusinessAccess(inner, { userId: client!.userId, businessId: harbor, brand: acme.brand }))).rejects.toMatchObject(notHere);

      // The partner's people lose it at once: their open, and the business their partner's domain remembered for them.
      await expect(asOperator(tx, { userId: acme.member.userId, businessId: harbor }, async (inner) => await requireBusinessAccess(inner, { userId: acme.member.userId, businessId: harbor, brand: acme.brand }))).rejects.toMatchObject(notHere);
      await expect(openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: harbor })).rejects.toMatchObject(notFound);
      const kept = await asMigrator(tx, async () => ({
        opens: await tx.select().from(partnerBusinessOpens).where(eq(partnerBusinessOpens.businessId, harbor)),
        remembered: await tx.select().from(userActiveBusinesses).where(eq(userActiveBusinesses.businessId, harbor)),
        invitations: await tx.select({ email: businessInvitations.email, status: businessInvitations.status }).from(businessInvitations).where(and(eq(businessInvitations.businessId, harbor), inArray(businessInvitations.role, ["business_admin", "viewer"]))),
        released: await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, harbor), eq(auditLogs.eventType, "partner.business_released"))),
        opened: await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, harbor), eq(auditLogs.eventType, "partner.business_opened"))),
        notice: await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.dedupeKey, `partner-business-released:${harbor}:${client!.email}`)),
      }));
      expect(kept.opens).toEqual([]);
      expect(kept.remembered).toEqual([]);
      expect(await readActiveBusinessId(acme.context.db, { userId: acme.member.userId, brand: acme.brand })).toBeNull();
      // The owner's other business on the partner's domain stays theirs to work in there.
      expect(await readActiveBusinessId(acme.context.db, { userId: client!.userId, brand: acme.brand })).toBe(pier);
      // The invitation the partner's member sent stops working; the owner's still waits.
      expect(kept.invitations.sort((left, right) => left.email.localeCompare(right.email))).toEqual([{ email: "front-desk@example.invalid", status: "pending" }, { email: "partner-pick@example.invalid", status: "revoked" }]);
      // The audit log records who released it, and keeps who opened it.
      expect(kept.released).toEqual([{ actorUserId: acme.adminActor.userId, payload: { partnerId: acme.partnerId, ownerUserId: client!.userId } }]);
      expect(kept.opened).toHaveLength(1);
      // The partner's domain knows to send them on, and only them, and only for this partner.
      expect(await partnerReleasedBusinessTo(acme.context, { userId: client!.userId, partnerId: acme.partnerId })).toBe(true);
      expect(await partnerReleasedBusinessTo(acme.context, { userId: acme.member.userId, partnerId: acme.partnerId })).toBe(false);
      expect(await partnerReleasedBusinessTo(acme.context, { userId: client!.userId, partnerId: randomUUID() })).toBe(false);
      // The owner hears where to sign in now, under the host's brand.
      expect(kept.notice).toEqual([{ payload: expect.objectContaining({ email: client!.email, template: "business_released", brand: { kind: "host" }, variables: expect.objectContaining({ businessName: "Harbor Dental", partnerName: "Acme Reception", url: expect.stringMatching(/\/login$/) }) }) }]);

      // A released business is no longer the partner's to release or delete.
      expect(await refusal(releaseBusiness(acme.context, acme.ownerActor, { businessId: harbor }))).toMatchObject(notFound);
      expect(await refusal(deletePartnerBusiness(acme.context, acme.ownerActor, { businessId: harbor }))).toMatchObject(notFound);
    });
  });

  it("turns off the webhooks platform keys and the partner's people set up, and revokes the invitations its keys sent", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const harbor = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      const hostKeyId = randomUUID();
      const { endpoints, keySent } = await asMigrator(tx, async () => {
        const [key] = await tx.insert(partnerPlatformKeys).values({ partnerId: acme.partnerId, name: "Acme CLI", prefix: `lsp_${randomUUID().slice(0, 8)}`, keyHash: hash(randomUUID()), scopes: ["webhooks:manage"] }).returning({ id: partnerPlatformKeys.id });
        const endpoint = (creator: { createdByPlatformKeyId?: string; createdByUserId?: string }) => ({ businessId: harbor, url: "https://hooks.example.test/in", events: ["call.completed"], encryptedSecret: "secret", ...creator });
        const made = await tx.insert(webhookEndpoints).values([
          endpoint({ createdByPlatformKeyId: key!.id }),
          endpoint({ createdByUserId: acme.member.userId }),
          endpoint({ createdByUserId: client!.userId }),
          endpoint({ createdByPlatformKeyId: hostKeyId }),
        ]).returning({ id: webhookEndpoints.id });
        // A partner's key invites as the partner, so the invitation names no inviter.
        const [invitation] = await tx.insert(businessInvitations).values({ businessId: harbor, invitedByUserId: null, invitedByPlatformKeyId: key!.id, email: "new@example.invalid", normalizedEmail: "new@example.invalid", role: "business_admin", tokenHash: hash(randomUUID()), expiresAt: new Date(Date.now() + 86_400_000) }).returning({ id: businessInvitations.id });
        return { endpoints: made.map((row) => row.id), keySent: invitation!.id };
      });
      await releaseBusiness(acme.context, acme.adminActor, { businessId: harbor });
      const after = await asMigrator(tx, async () => ({
        endpoints: await tx.select({ id: webhookEndpoints.id, status: webhookEndpoints.status }).from(webhookEndpoints).where(inArray(webhookEndpoints.id, endpoints)),
        invitation: (await tx.select({ status: businessInvitations.status }).from(businessInvitations).where(eq(businessInvitations.id, keySent)))[0],
        audited: await tx.select({ entityId: auditLogs.entityId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, harbor), eq(auditLogs.eventType, "webhook_endpoint.disabled"))),
      }));
      const status = (id: string) => after.endpoints.find((row) => row.id === id)?.status;
      // The partner's key and its team member lose the business, so their webhooks stop. As with a claim link, so do other platform keys'.
      expect([status(endpoints[0]!), status(endpoints[1]!), status(endpoints[3]!)]).toEqual(["disabled", "disabled", "disabled"]);
      // The owner's own webhook keeps sending.
      expect(status(endpoints[2]!)).toBe("enabled");
      expect(after.invitation?.status).toBe("revoked");
      expect(after.audited.map((row) => row.entityId).sort()).toEqual([endpoints[0]!, endpoints[1]!, endpoints[3]!].sort());
      expect(after.audited[0]?.payload).toMatchObject({ reason: "business_released", partnerId: acme.partnerId });
    });
  });
});

describe.skipIf(!client)("deleting a business", () => {
  it("needs an owner or admin of the business's own partner, and waits while a number is being bought for it", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [client] = await people(tx, 1);
      const harbor = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });

      expect(await refusal(deletePartnerBusiness(acme.context, acme.memberActor, { businessId: harbor }))).toMatchObject({ status: 403 });
      expect(await refusal(deletePartnerBusiness(bright.context, bright.adminActor, { businessId: harbor }))).toMatchObject(notFound);

      // A self-hosted server's partner businesses buy numbers. A purchase under way would finish for a business that's gone, so the delete waits.
      await asMigrator(tx, async () => await tx.update(businesses).set({ deploymentMode: "self_hosted_standard" }).where(eq(businesses.id, harbor)));
      const [claim] = await asMigrator(tx, async () => await tx.insert(onboardingNumberClaimEvents).values({ businessId: harbor, userId: client!.userId, requestedE164: phoneNumber(), selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "provisioning" }).returning({ id: onboardingNumberClaimEvents.id }));
      expect(await refusal(deletePartnerBusiness(acme.context, acme.ownerActor, { businessId: harbor }))).toMatchObject({ status: 409, code: "business_number_in_progress" });
      // A purchase no worker will finish stops holding it up.
      await asMigrator(tx, async () => await tx.update(onboardingNumberClaimEvents).set({ updatedAt: sql`now() - interval '31 minutes'` }).where(eq(onboardingNumberClaimEvents.id, claim!.id)));
      await expect(deletePartnerBusiness(acme.context, acme.ownerActor, { businessId: harbor })).resolves.toBeUndefined();
      // Its owner hears it's gone, from the partner.
      const notices = await asMigrator(tx, async () => await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.dedupeKey, `partner-business-deleted:${harbor}:${client!.email}`)));
      expect(notices).toEqual([{ businessId: null, payload: expect.objectContaining({ email: client!.email, template: "business_deleted", brand: { kind: "partner", partnerId: acme.partnerId }, variables: { businessName: "Harbor Dental" } }) }]);
    });
  });

  it("removes the business with everything in it, drops what it queued, and queues its stored files for deletion", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const harbor = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: client!, name: "Harbor Dental" });
      // A business whose owner hasn't joined yet still has its invitation email waiting to go out.
      const { businessId: pier } = await createPartnerBusiness(acme.context, acme.ownerActor, { name: "Pier Clinic", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@pier.invalid" });
      await openPartnerBusiness(acme.context, { userId: acme.member.userId, businessId: harbor });
      await asOperator(tx, { userId: acme.member.userId, businessId: harbor }, async (inner) => await inner.insert(services).values({ businessId: harbor, name: "Cleaning", slug: `cleaning-${randomUUID()}`, durationMinutes: 30 }));
      await use(tx, harbor, { voiceSeconds: 120, chats: 1 });
      // Its numbers go back to the provider, except one released already and the shared sender every business texts from.
      const sharedSender = phoneNumber();
      vi.stubEnv("TWILIO_ALERT_SMS_FROM", sharedSender);
      const numbers = await asMigrator(tx, async () => await tx.insert(phoneNumbers).values([
        { businessId: harbor, e164: phoneNumber(), providerPhoneId: providerPhoneId(), status: "active" },
        { businessId: harbor, e164: phoneNumber(), providerPhoneId: providerPhoneId(), status: "reclaiming" },
        { businessId: harbor, e164: phoneNumber(), providerPhoneId: providerPhoneId(), status: "reclaimed" },
        { businessId: harbor, e164: sharedSender, providerPhoneId: providerPhoneId(), status: "active" },
      ]).returning({ id: phoneNumbers.id, e164: phoneNumbers.e164, providerPhoneId: phoneNumbers.providerPhoneId }));
      const objectKey = `${harbor}/knowledge/${randomUUID()}.pdf`;
      await asMigrator(tx, async () => await tx.insert(storageObjects).values([
        { businessId: harbor, objectKey, purpose: "knowledge", fileName: "menu.pdf", contentType: "application/pdf", status: "ready" },
        { businessId: harbor, objectKey: `${harbor}/knowledge/${randomUUID()}.pdf`, purpose: "knowledge", fileName: "old.pdf", contentType: "application/pdf", status: "deleted" },
      ]));

      await deletePartnerBusiness(acme.context, acme.adminActor, { businessId: harbor });
      await deletePartnerBusiness(acme.context, acme.ownerActor, { businessId: pier });

      const left = await asMigrator(tx, async () => ({
        businesses: await tx.select({ id: businesses.id }).from(businesses).where(inArray(businesses.id, [harbor, pier])),
        memberships: await tx.select({ id: businessMemberships.id }).from(businessMemberships).where(inArray(businessMemberships.businessId, [harbor, pier])),
        services: await tx.select({ id: services.id }).from(services).where(eq(services.businessId, harbor)),
        usage: await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, harbor)),
        opens: await tx.select().from(partnerBusinessOpens).where(eq(partnerBusinessOpens.businessId, harbor)),
        remembered: await tx.select().from(userActiveBusinesses).where(inArray(userActiveBusinesses.businessId, [harbor, pier])),
        stored: await tx.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.businessId, harbor)),
        queued: await tx.select({ topic: outboxMessages.topic, businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(inArray(outboxMessages.aggregateId, [harbor, pier])),
        numbers: await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.businessId, harbor)),
        released: await tx.select({ topic: outboxMessages.topic, businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(inArray(outboxMessages.aggregateId, numbers.map((number) => number.id))).orderBy(outboxMessages.createdAt, outboxMessages.id),
        ownerInvitationEmail: await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.topic, "email.send"), sql`${outboxMessages.payload}->>'email' = 'owner@pier.invalid'`)),
      }));
      expect(left).toEqual({
        businesses: [],
        memberships: [],
        services: [],
        usage: [],
        opens: [],
        remembered: [],
        stored: [],
        // Only the cleanup of the file it still kept, and the note to its owner that it's gone, which belong to no business now.
        queued: expect.arrayContaining([{ topic: "privacy.deleteStoredObjects", businessId: null, payload: { objectKeys: [objectKey] } }, { topic: "email.sendNotice", businessId: null, payload: expect.objectContaining({ template: "business_deleted" }) }]),
        numbers: [],
        // The active number, and the one a reclaim was releasing in case that release fails now the business is gone.
        released: expect.arrayContaining(numbers.slice(0, 2).map((number) => ({ topic: "phoneNumber.releaseDeleted", businessId: null, payload: { providerPhoneId: number.providerPhoneId, e164: number.e164 } }))),
        // Pier's owner never gets an invitation to a business that's gone.
        ownerInvitationEmail: [],
      });
      expect(left.released).toHaveLength(2);
      expect(await listPartnerBusinesses(acme.context, acme.memberActor)).toEqual([]);
      expect(await listUserBusinesses(acme.context.db, client!.userId, acme.brand)).toEqual([]);
      expect(await refusal(deletePartnerBusiness(acme.context, acme.ownerActor, { businessId: harbor }))).toMatchObject(notFound);
    });
  });
});
