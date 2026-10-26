import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, businesses, businessInvitations, businessMemberships, createDatabaseClient, outboxMessages, partnerMembers, partnerPlatformKeys, partners, platformKeyBusinesses, users, webhookEndpoints, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { businessApiKeyScopes } from "@lobbystack/shared";

import { AuthorizationError } from "../authz";
import { forgetCachedBrands } from "./brands";
import { createPartnerBusiness, hashPartnerToken, acceptPartnerInvitation, invitePartnerMember, signUpPartner, type PartnerMemberActor } from "./partners";
import { createPartnerPlatformKey, listPartnerPlatformKeys, revokePartnerPlatformKey } from "./partnerPlatformKeys";
import { createBusinessForApi, createCheckoutForApi, createClaimLinkForApi, createKnowledgeEntryForApi, createPartnerBusinessForApi, createTeamInvitationForApi, endManagedPlanForApi, getPlatformMeForApi, listBusinessesForApi, platformBusinessId, resolveActingUserId, setManagedPlanForApi, type PlatformKeyCaller } from "./publicApi/operations";
import { generatePlatformKey, platformKeyReach, PlatformKeyConfigError, requirePlatformBusinessAccess, resolvePlatformKey, touchPlatformKeyLastUsed, type PartnerPlatformKey } from "./publicApi/platformKeys";
import { createWebhookEndpoint, disableRemovedPlatformKeyWebhooks } from "./publicApi/webhooks";
import { acceptInvitation } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner platform key integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
  vi.stubEnv("PLATFORM_API_KEYS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

/** Runs a test in one transaction as the app role, and rolls everything it wrote back. */
async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await tx.execute(sql`set local role lobbystack_app`);
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

async function people(tx: DatabaseTransaction, count: number): Promise<Array<{ userId: string; email: string }>> {
  const made = Array.from({ length: count }, () => {
    const userId = randomUUID();
    return { userId, email: `${userId}@example.invalid` };
  });
  await asMigrator(tx, async () => { await tx.insert(users).values(made.map((person) => ({ id: person.userId, email: person.email, normalizedEmail: person.email, name: `Person ${person.userId.slice(0, 4)}`, emailVerified: true }))); });
  return made;
}

/** Runs `run`, then `restore`. A failure in `run` wins over one in `restore`, which an aborted transaction would raise. */
async function restoring<T>(run: () => Promise<T>, restore: () => Promise<void>): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    await restore().catch(() => undefined);
    throw error;
  }
  await restore();
  return result;
}

/** Reads or writes as the migrator, then goes back to the app role. */
async function asMigrator<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  return await restoring(run, async () => { await tx.execute(sql`set local role lobbystack_app`); });
}

/**
 * Runs as the worker role, as the v1 API does, then goes back to the app
 * role. Security-definer functions trust session_user, so this switches it
 * rather than the current role.
 */
async function asWorker<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  return await restoring(run, async () => {
    await tx.execute(sql`reset session authorization`);
    await tx.execute(sql`set local role lobbystack_app`);
  });
}

/** Runs statements in a savepoint, so a refused one doesn't abort the test's transaction. */
async function savepoint<T>(tx: DatabaseTransaction, run: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await tx.transaction(run);
}

/** A refusal's error, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string; name?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string; name?: string });
}

async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

/** A partner signed up by its owner, with an admin and a member on its team. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, admin, member] = await people(tx, 3);
  const context = { db: tx as unknown as Database };
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  for (const [person, role] of [[admin!, "admin"], [member!, "member"]] as const) {
    const { invitationId } = await invitePartnerMember(context, ownerActor, { email: person.email, role });
    await acceptPartnerInvitation(context, { userId: person.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: person.email, emailVerified: true });
  }
  const adminActor: PartnerMemberActor = { kind: "member", partnerId, userId: admin!.userId, role: "admin" };
  const memberActor: PartnerMemberActor = { kind: "member", partnerId, userId: member!.userId, role: "member" };
  const business = async (businessName: string) => (await createPartnerBusiness(context, ownerActor, { name: businessName, timezone: "America/Toronto", businessType: "plumbing", accessLevel: "full", ownerEmail: `${randomUUID()}@example.invalid` })).businessId;
  return { context, partnerId, owner: owner!, ownerActor, adminActor, memberActor, business };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** The caller a partner's key becomes for a business, as the v1 pipeline builds it. */
function partnerCaller(key: PartnerPlatformKey, businessId: string): PlatformKeyCaller {
  return { businessId, platformKeyId: key.platformKeyId, groupId: key.group, partnerId: key.partnerId, actor: "platform_key" };
}

describe.skipIf(!testUrl)("platform keys partners make, against PostgreSQL with RLS", () => {
  it("keeps only the key's hash, shows the key once, and resolves it after PLATFORM_API_KEYS as the partner", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const { key, platformKey } = await createPartnerPlatformKey(acme.context, acme.ownerActor, { name: "  Zapier   sync ", scopes: ["businesses:create", "business:read", "contacts:read"] });
      expect(key).toMatch(/^lsp_[0-9a-f]{8}_[A-Za-z0-9_-]{32}$/);
      expect(key.startsWith(`${platformKey.prefix}_`)).toBe(true);
      expect(platformKey).toEqual({ id: expect.any(String), name: "Zapier sync", prefix: platformKey.prefix, scopes: ["business:read", "contacts:read", "businesses:create"], createdAt: expect.any(String), createdBy: { userId: acme.owner.userId, name: expect.any(String), email: acme.owner.email }, lastUsedAt: null, revokedAt: null });
      const [row] = await asMigrator(tx, async () => await tx.select().from(partnerPlatformKeys).where(eq(partnerPlatformKeys.id, platformKey.id)));
      expect(row).toMatchObject({ partnerId: acme.partnerId, keyHash: sha256(key), access: "group" });
      // Nothing stored holds the key, or its secret part.
      expect(JSON.stringify(row)).not.toContain(key.slice(13));

      const resolved = await asWorker(tx, async () => await resolvePlatformKey(acme.context, key, {}));
      expect(resolved).toEqual({ platformKeyId: platformKey.id, prefix: platformKey.prefix, name: "Zapier sync", group: acme.partnerId, partnerId: acme.partnerId, access: "group", scopes: ["business:read", "contacts:read", "businesses:create"], createdAt: platformKey.createdAt });
      expect(resolved?.ownerEmail).toBeUndefined();

      // The host's keys come first, from PLATFORM_API_KEYS.
      const host = generatePlatformKey({ name: "Host", group: "lobbystack", ownerEmail: "ops@lobbystack.example", access: "all" });
      const environment = { PLATFORM_API_KEYS: JSON.stringify([host.entry, { ...generatePlatformKey({ name: "Same prefix", group: "other", ownerEmail: "ops@other.example" }).entry, prefix: platformKey.prefix }]) };
      expect(await asWorker(tx, async () => await resolvePlatformKey(acme.context, host.key, environment))).toMatchObject({ platformKeyId: host.entry.id, ownerEmail: "ops@lobbystack.example", access: "all" });
      // A host entry with the same prefix but another key doesn't hide the partner's key.
      expect(await asWorker(tx, async () => await resolvePlatformKey(acme.context, key, environment))).toEqual(resolved);
      // A malformed PLATFORM_API_KEYS refuses every platform key, the partner's included.
      await expect(asWorker(tx, async () => await resolvePlatformKey(acme.context, key, { PLATFORM_API_KEYS: "{not json" }))).rejects.toBeInstanceOf(PlatformKeyConfigError);
      expect(await asWorker(tx, async () => await resolvePlatformKey(acme.context, `${platformKey.prefix}_${"A".repeat(32)}`, {}))).toBeNull();

      // Only the worker role, which serves /api/v1, may resolve one.
      expect(await refusal(savepoint(tx, async (inner) => await inner.execute(sql`select * from app.resolve_partner_platform_key(${sha256(key)})`)))).toMatchObject({ code: "42501" });

      // Use is recorded, at most once a minute.
      await asWorker(tx, async () => { await touchPlatformKeyLastUsed(acme.context, resolved!); });
      const [used] = await asMigrator(tx, async () => await tx.select({ lastUsedAt: partnerPlatformKeys.lastUsedAt }).from(partnerPlatformKeys).where(eq(partnerPlatformKeys.id, platformKey.id)));
      expect(used?.lastUsedAt).toBeInstanceOf(Date);
      expect((await listPartnerPlatformKeys(acme.context, acme.adminActor))[0]?.lastUsedAt).toBe(used!.lastUsedAt!.toISOString());
    });
  });

  it("lets only the partner's owners and admins make, list and revoke its keys", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const other = await partner(tx, "Other Agency");
      const made = await createPartnerPlatformKey(acme.context, acme.adminActor, { name: "Admin's key", scopes: [...businessApiKeyScopes] });
      expect(made.platformKey.createdBy?.userId).toBe(acme.adminActor.userId);
      expect((await listPartnerPlatformKeys(acme.context, acme.ownerActor)).map((key) => key.id)).toEqual([made.platformKey.id]);

      // A member works inside businesses and sees no keys.
      expect(await refusal(createPartnerPlatformKey(acme.context, acme.memberActor, { name: "Member's key", scopes: ["business:read"] }))).toBeInstanceOf(AuthorizationError);
      expect(await refusal(listPartnerPlatformKeys(acme.context, acme.memberActor))).toBeInstanceOf(AuthorizationError);
      expect(await refusal(revokePartnerPlatformKey(acme.context, acme.memberActor, { platformKeyId: made.platformKey.id }))).toBeInstanceOf(AuthorizationError);
      // A platform key can't manage keys.
      expect(await refusal(createPartnerPlatformKey(acme.context, { kind: "key", partnerId: acme.partnerId, platformKeyId: made.platformKey.id }, { name: "Key's key", scopes: ["business:read"] }))).toBeInstanceOf(AuthorizationError);
      // Another partner's owner can't see or revoke it, even naming this partner.
      expect(await refusal(listPartnerPlatformKeys(acme.context, { ...other.ownerActor, partnerId: acme.partnerId }))).toBeInstanceOf(AuthorizationError);
      expect(await refusal(revokePartnerPlatformKey(acme.context, other.ownerActor, { platformKeyId: made.platformKey.id }))).toMatchObject({ status: 404 });
      expect(await listPartnerPlatformKeys(acme.context, other.ownerActor)).toEqual([]);

      // Row-level security holds the same rules for a direct write.
      const asOperator = async <T>(userId: string, run: (inner: DatabaseTransaction) => Promise<T>) => await savepoint(tx, async (inner) => {
        await inner.execute(sql`select set_config('app.user_id', ${userId}, true), set_config('app.business_id', '', true), set_config('app.actor_type', 'operator', true)`);
        return await run(inner);
      });
      const row = (userId: string) => ({ partnerId: acme.partnerId, name: "Direct", prefix: "lsp_0a0b0c0d", keyHash: sha256(randomUUID()), scopes: ["business:read"], createdByUserId: userId });
      expect(await refusal(asOperator(acme.memberActor.userId, async (inner) => await inner.insert(partnerPlatformKeys).values(row(acme.memberActor.userId))))).toMatchObject({ code: "42501" });
      // Nobody makes a key in someone else's name.
      expect(await refusal(asOperator(acme.adminActor.userId, async (inner) => await inner.insert(partnerPlatformKeys).values(row(acme.ownerActor.userId))))).toMatchObject({ code: "42501" });
      expect(await asOperator(acme.memberActor.userId, async (inner) => await inner.select({ id: partnerPlatformKeys.id }).from(partnerPlatformKeys))).toEqual([]);
      // A key can only be revoked: its name, scopes and partner never change.
      expect(await refusal(asOperator(acme.ownerActor.userId, async (inner) => await inner.update(partnerPlatformKeys).set({ name: "Renamed" }).where(eq(partnerPlatformKeys.id, made.platformKey.id))))).toMatchObject({ code: "42501" });

      expect(await refusal(createPartnerPlatformKey(acme.context, acme.ownerActor, { name: " ", scopes: ["business:read"] }))).toMatchObject({ status: 400, code: "invalid_name" });
      expect(await refusal(createPartnerPlatformKey(acme.context, acme.ownerActor, { name: "No scopes", scopes: [] }))).toMatchObject({ status: 400, code: "invalid_scopes" });
      expect(await refusal(createPartnerPlatformKey(acme.context, acme.ownerActor, { name: "Unknown scope", scopes: ["everything"] }))).toMatchObject({ status: 400, code: "invalid_scopes" });
    });
  });

  it("never holds or resolves a key with access to every business", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const { platformKey } = await createPartnerPlatformKey(acme.context, acme.ownerActor, { name: "Group only", scopes: ["business:read"] });
      // The database refuses it, whoever writes it.
      expect(await refusal(asMigrator(tx, async () => await savepoint(tx, async (inner) => await inner.update(partnerPlatformKeys).set({ access: "all" as "group" }).where(eq(partnerPlatformKeys.id, platformKey.id)))))).toMatchObject({ code: "23514" });
      expect(await refusal(savepoint(tx, async (inner) => {
        await inner.execute(sql`select set_config('app.user_id', ${acme.ownerActor.userId}, true), set_config('app.business_id', '', true), set_config('app.actor_type', 'operator', true)`);
        await inner.insert(partnerPlatformKeys).values({ partnerId: acme.partnerId, name: "Root", prefix: "lsp_0f0e0d0c", keyHash: sha256(randomUUID()), access: "all" as "group", scopes: ["business:read"], createdByUserId: acme.ownerActor.userId });
      }))).toMatchObject({ code: "23514" });
      expect(await asMigrator(tx, async () => await tx.select({ access: partnerPlatformKeys.access }).from(partnerPlatformKeys).where(eq(partnerPlatformKeys.partnerId, acme.partnerId)))).toEqual([{ access: "group" }]);
    });
  });

  it("reaches only its partner's active businesses, through the partner's group, and lists all of them", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const other = await partner(tx, "Other Agency");
      const [plumbing, dental] = [await acme.business("Acme Plumbing"), await acme.business("Acme Dental")];
      const elsewhere = await other.business("Other Bakery");
      const direct = randomUUID();
      await asMigrator(tx, async () => { await tx.insert(businesses).values({ id: direct, slug: `direct-${direct}`, name: "Direct Spa", timezone: "UTC", businessType: "test" }); });
      const { key } = await createPartnerPlatformKey(acme.context, acme.ownerActor, { name: "Reach", scopes: ["business:read"] });
      const resolved = (await asWorker(tx, async () => await resolvePlatformKey(acme.context, key, {}))) as PartnerPlatformKey;
      const reach = (businessId: string) => asWorker(tx, async () => await requirePlatformBusinessAccess(acme.context, { businessId, ...platformKeyReach(resolved) }));

      await reach(plumbing);
      await reach(dental);
      for (const businessId of [elsewhere, direct, randomUUID()]) expect(await refusal(reach(businessId))).toMatchObject({ status: 404, code: "not_found" });
      await asMigrator(tx, async () => { await tx.update(businesses).set({ status: "suspended" }).where(eq(businesses.id, dental)); });
      expect(await refusal(reach(dental))).toMatchObject({ status: 404, code: "not_found" });

      const listed = await asWorker(tx, async () => (await listBusinessesForApi(acme.context, { groupId: resolved.group, limit: 100 })).data.map((business) => business.id));
      expect(listed).toEqual([plumbing]);
      // A page at a time, newest first.
      await asMigrator(tx, async () => { await tx.update(businesses).set({ status: "active" }).where(eq(businesses.id, dental)); });
      const first = await asWorker(tx, async () => await listBusinessesForApi(acme.context, { groupId: resolved.group, limit: 1 }));
      const second = await asWorker(tx, async () => await listBusinessesForApi(acme.context, { groupId: resolved.group, limit: 1, cursor: first.next_cursor! }));
      expect([...first.data, ...second.data].map((business) => business.id).sort()).toEqual([plumbing, dental].sort());
      expect(second.has_more).toBe(false);

      // The console's businesses are in the partner's group, in the table that links every group's keys to their businesses.
      const links = async () => await asMigrator(tx, async () => (await tx.select({ businessId: platformKeyBusinesses.businessId, groupId: platformKeyBusinesses.groupId }).from(platformKeyBusinesses).where(inArray(platformKeyBusinesses.businessId, [plumbing, dental, elsewhere, direct]))).map((link) => `${link.groupId}:${link.businessId}`).sort());
      expect(await links()).toEqual([`${acme.partnerId}:${plumbing}`, `${acme.partnerId}:${dental}`, `${other.partnerId}:${elsewhere}`].sort());
      // A group means the same thing whichever source its key came from: a host's key in the partner's group reaches the same businesses.
      await asWorker(tx, async () => { await requirePlatformBusinessAccess(acme.context, { businessId: plumbing, groupId: acme.partnerId, access: "group" }); });
      // The partner's group holds only the partner's businesses, whoever links one.
      for (const businessId of [direct, elsewhere]) {
        expect(await refusal(asMigrator(tx, async () => await savepoint(tx, async (inner) => await inner.insert(platformKeyBusinesses).values({ businessId, groupId: acme.partnerId }))))).toMatchObject({ code: "42501", message: "partner_group_business_mismatch" });
      }
      // A business that leaves the partner, as a release will make it, leaves the partner's group, and the key no longer reaches it.
      await asMigrator(tx, async () => { await tx.update(businesses).set({ partnerId: null }).where(eq(businesses.id, dental)); });
      expect(await links()).toEqual([`${acme.partnerId}:${plumbing}`, `${other.partnerId}:${elsewhere}`].sort());
      expect(await refusal(reach(dental))).toMatchObject({ status: 404, code: "not_found" });

      expect(await asWorker(tx, async () => (await getPlatformMeForApi(acme.context, resolved, partnerCaller(resolved, plumbing))).business)).toEqual({ id: plumbing, name: "Acme Plumbing" });
    });
  });

  it("creates the partner's businesses through POST /businesses, and invites each owner as the partner", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const [client] = await people(tx, 1);
      const { key, platformKey } = await createPartnerPlatformKey(acme.context, acme.adminActor, { name: "Onboarding", scopes: ["businesses:create", "business:read"] });
      const resolved = (await asWorker(tx, async () => await resolvePlatformKey(acme.context, key, {}))) as PartnerPlatformKey;
      expect((await asWorker(tx, async () => await getPlatformMeForApi(acme.context, resolved, null))).platform).toEqual({ group: acme.partnerId, partner: acme.partnerId, reach: "group", access: "partner", partner_id: acme.partnerId });
      const body = { name: "Harbor Dental", timezone: "America/Halifax", locale: "fr", website_url: "https://harbor.example", business_type: "dental", owner_email: client!.email, access_level: "activity" } as const;
      const create = (input: { idempotencyKey: string; body: Record<string, unknown> }, beforeCreate?: () => Promise<void>) => createPartnerBusinessForApi(acme.context, { key: resolved, idempotencyKey: input.idempotencyKey, requestHash: sha256(JSON.stringify(input.body)), body: input.body as never }, { beforeCreate });
      let checked = 0;
      const made = await create({ idempotencyKey: "onboard-harbor", body }, async () => { checked += 1; });
      const businessId = platformBusinessId(platformKey.id, "onboard-harbor");
      expect(made).toEqual({ business: expect.objectContaining({ id: businessId, name: "Harbor Dental", timezone: "America/Halifax", locale: "fr", website_url: "https://harbor.example", business_type: "dental", onboarding_stage: "verify_phone" }), replayed: false });
      expect(checked).toBe(1);

      // The business is the partner's, at the access level asked for, with no owner and nobody on its team yet.
      const [stored] = await asMigrator(tx, async () => await tx.select({ partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel }).from(businesses).where(eq(businesses.id, businessId)));
      expect(stored).toEqual({ partnerId: acme.partnerId, accessLevel: "activity" });
      expect(await asMigrator(tx, async () => await tx.select({ id: businessMemberships.id }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId)))).toEqual([]);
      // The key invites the owner as the partner: no person sent it, and it's never a claim link.
      const [invitation] = await asMigrator(tx, async () => await tx.select().from(businessInvitations).where(eq(businessInvitations.businessId, businessId)));
      expect(invitation).toMatchObject({ invitedByUserId: null, invitedByPlatformKeyId: platformKey.id, normalizedEmail: client!.email, role: "business_owner", transfersOwnership: false, status: "pending" });
      const [email] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitation!.id), eq(outboxMessages.topic, "email.send"))));
      expect(email?.payload).toMatchObject({ template: "invitation", email: client!.email, brand: { kind: "business", businessId } });
      const [audit] = await asMigrator(tx, async () => await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "partner.business_created"))));
      expect(audit).toEqual({ actorUserId: null, payload: { actor: "platform_key", platformKeyId: platformKey.id, groupId: acme.partnerId, partnerId: acme.partnerId, accessLevel: "activity", packageId: null, ownerInvitationId: invitation!.id, requestHash: sha256(JSON.stringify(body)) } });
      // The key reaches it, and lists it with the console's businesses.
      await asWorker(tx, async () => { await requirePlatformBusinessAccess(acme.context, { businessId, ...platformKeyReach(resolved) }); });
      expect(await asWorker(tx, async () => (await listBusinessesForApi(acme.context, { groupId: resolved.group, limit: 100 })).data.map((business) => business.id))).toEqual([businessId]);

      // A retry with the same Idempotency-Key gets the same business back and sends nothing more; another body is refused.
      expect(await create({ idempotencyKey: "onboard-harbor", body }, async () => { checked += 1; })).toEqual({ business: made.business, replayed: true });
      expect(checked).toBe(1);
      expect(await asMigrator(tx, async () => (await tx.select({ id: businessInvitations.id }).from(businessInvitations).where(eq(businessInvitations.businessId, businessId))).length)).toBe(1);
      expect(await refusal(create({ idempotencyKey: "onboard-harbor", body: { ...body, name: "Harbour Dental" } }))).toMatchObject({ status: 422, code: "idempotency_key_reused" });

      // The owner accepts on the partner's domain and owns it; the business stays with the partner.
      expect(await acceptInvitation(acme.context, { userId: client!.userId, tokenHash: sha256(await linkToken(tx, invitation!.id)), email: client!.email, emailVerified: true })).toEqual({ businessId, role: "business_owner", partnerId: acme.partnerId });
      // The key invites the business's staff as the partner too.
      const staff = await asWorker(tx, async () => await createTeamInvitationForApi(acme.context, partnerCaller(resolved, businessId), { email: "front@harbor.example", role: "scheduler" }, { platformKeyId: platformKey.id }));
      const [sent] = await asMigrator(tx, async () => await tx.select({ invitedByUserId: businessInvitations.invitedByUserId, invitedByPlatformKeyId: businessInvitations.invitedByPlatformKeyId, role: businessInvitations.role }).from(businessInvitations).where(eq(businessInvitations.id, staff.id)));
      expect(sent).toEqual({ invitedByUserId: null, invitedByPlatformKeyId: platformKey.id, role: "scheduler" });

      // owner_email is required, the access level defaults to full, and the console's checks hold.
      expect(await refusal(create({ idempotencyKey: "no-owner", body: { name: "No Owner", timezone: "UTC" } }))).toMatchObject({ status: 400, code: "invalid_request", details: [{ path: "owner_email" }] });
      expect(await refusal(create({ idempotencyKey: "bad-email", body: { name: "Bad Email", timezone: "UTC", owner_email: "one@example.invalid, two@example.invalid" } }))).toMatchObject({ status: 400, details: [{ path: "owner_email" }] });
      expect(await refusal(create({ idempotencyKey: "bad-zone", body: { name: "Bad Zone", timezone: "Mars/Olympus", owner_email: client!.email } }))).toMatchObject({ status: 400, details: [{ path: "timezone" }] });
      const full = await create({ idempotencyKey: "onboard-pier", body: { name: "Pier Plumbing", timezone: "UTC", owner_email: `${randomUUID()}@example.invalid` } });
      const [pier] = await asMigrator(tx, async () => await tx.select({ accessLevel: businesses.partnerAccessLevel, stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, full.business.id)));
      expect(pier).toEqual({ accessLevel: "full", stage: "website" });
      // A business needs the partner's own domain to open on.
      vi.stubEnv("PARTNER_BASE_DOMAIN", "");
      expect(await refusal(create({ idempotencyKey: "no-domain", body: { name: "No Domain", timezone: "UTC", owner_email: client!.email } }))).toMatchObject({ status: 409, code: "conflict" });
      vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");

      // The database holds a claim link to a person, and every invitation to someone who sent it.
      const row = { businessId, email: "x@example.invalid", normalizedEmail: "x@example.invalid", role: "business_owner", tokenHash: sha256(randomUUID()), expiresAt: new Date(Date.now() + 60_000) };
      expect(await refusal(asMigrator(tx, async () => await savepoint(tx, async (inner) => await inner.insert(businessInvitations).values({ ...row, invitedByPlatformKeyId: platformKey.id, transfersOwnership: true }))))).toMatchObject({ code: "23514" });
      expect(await refusal(asMigrator(tx, async () => await savepoint(tx, async (inner) => await inner.insert(businessInvitations).values(row))))).toMatchObject({ code: "23514" });
    });
  });

  it("leaves owner_email and access_level to a partner's keys", async () => {
    await rollbackTest(async (tx) => {
      const [owner] = await people(tx, 1);
      const host = generatePlatformKey({ name: "Host", group: "lobbystack", ownerEmail: owner!.email });
      const hostKey = { platformKeyId: host.entry.id, prefix: host.entry.prefix, name: host.entry.name, group: "lobbystack", ownerEmail: owner!.email, access: "group" as const, scopes: ["businesses:create" as const], createdAt: host.entry.created_at };
      expect(await refusal(asWorker(tx, async () => await createBusinessForApi({ db: tx as unknown as Database }, { key: hostKey, actingUserId: owner!.userId, idempotencyKey: "host", requestHash: "h", body: { name: "Host Business", timezone: "UTC", owner_email: "client@example.invalid", access_level: "activity" } })))).toMatchObject({ status: 400, code: "invalid_request", details: [{ path: "owner_email" }, { path: "access_level" }] });
      expect(await asMigrator(tx, async () => await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, platformBusinessId(host.entry.id, "host"))))).toEqual([]);
    });
  });

  it("acts as the partner, and is refused managed plans, claim links, Polar checkout and what needs a person", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const plumbing = await acme.business("Acme Plumbing");
      const { key } = await createPartnerPlatformKey(acme.context, acme.ownerActor, { name: "Refusals", scopes: ["billing:manage", "team:manage", "knowledge:write"] });
      const resolved = (await asWorker(tx, async () => await resolvePlatformKey(acme.context, key, {}))) as PartnerPlatformKey;
      const caller = partnerCaller(resolved, plumbing);
      await asWorker(tx, async () => {
        for (const attempt of [
          setManagedPlanForApi(acme.context, caller),
          endManagedPlanForApi(acme.context, caller),
          createClaimLinkForApi(acme.context, caller, { email: "owner@example.invalid" }, { userId: acme.owner.userId }),
          createCheckoutForApi(acme.context, caller, { plan: "starter", interval: "monthly" }, { available: true }),
          resolveActingUserId(acme.context, caller),
        ]) {
          expect(await refusal(attempt)).toMatchObject({ status: 403, code: "forbidden" });
        }
      });
      // Its changes are audited as the key and its partner.
      const entry = await asWorker(tx, async () => await createKnowledgeEntryForApi(acme.context, caller, { type: "faq", question: "Do you work weekends?", answer: "Saturdays, 9 to 1." }));
      const [row] = await asMigrator(tx, async () => await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, plumbing), eq(auditLogs.entityId, entry.id))));
      expect(row).toEqual({ actorUserId: null, payload: { actor: "platform_key", platformKeyId: resolved.platformKeyId, groupId: acme.partnerId, partnerId: acme.partnerId, type: "faq" } });
      // None of the refusals changed anything.
      expect(await asMigrator(tx, async () => await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, plumbing), inArray(auditLogs.eventType, ["api.billing.managed_plan_set", "api.billing.managed_plan_ended", "api.team.claim_link_created", "api.billing.checkout_started"]))))).toEqual([]);
    });
  });

  it("keeps an active key's webhooks at startup, and turns them off, with its team invitations, the moment the key is revoked", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const [plumbing, dental] = [await acme.business("Acme Plumbing"), await acme.business("Acme Dental")];
      const { key, platformKey } = await createPartnerPlatformKey(acme.context, acme.ownerActor, { name: "Webhooks", scopes: ["webhooks:manage", "contacts:read", "team:manage", "businesses:create"] });
      const resolved = (await asWorker(tx, async () => await resolvePlatformKey(acme.context, key, {}))) as PartnerPlatformKey;
      const removedHostKey = randomUUID();
      const hook = async (businessId: string, manager: Parameters<typeof createWebhookEndpoint>[1]["manager"], host: string) => await asWorker(tx, async () => (await createWebhookEndpoint(acme.context, { businessId, manager, url: `https://${host}.example.com/hook`, events: ["contact.created"] })).endpoint.id);
      const byKey = await hook(plumbing, { kind: "platform_key", platformKeyId: resolved.platformKeyId, groupId: resolved.group, partnerId: resolved.partnerId }, "partner-key");
      const byKeyElsewhere = await hook(dental, { kind: "platform_key", platformKeyId: resolved.platformKeyId, groupId: resolved.group, partnerId: resolved.partnerId }, "partner-key-dental");
      const byRemovedHostKey = await hook(plumbing, { kind: "platform_key", platformKeyId: removedHostKey, groupId: "acme", actingUserId: acme.owner.userId }, "host-key");
      const ids = [byKey, byKeyElsewhere, byRemovedHostKey];
      const status = async () => Object.fromEntries((await asMigrator(tx, async () => await tx.select({ id: webhookEndpoints.id, status: webhookEndpoints.status }).from(webhookEndpoints).where(inArray(webhookEndpoints.id, ids)))).map((row) => [row.id, row.status]));
      const [created] = await asMigrator(tx, async () => await tx.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.entityId, byKey), eq(auditLogs.eventType, "webhook_endpoint.created"))));
      expect(created?.payload).toEqual({ actor: "platform_key", platformKeyId: resolved.platformKeyId, groupId: acme.partnerId, partnerId: acme.partnerId, events: ["contact.created"] });

      // The admin starts with an empty PLATFORM_API_KEYS: the partner's key isn't in it, and keeps its webhooks.
      await asWorker(tx, async () => { await disableRemovedPlatformKeyWebhooks(acme.context, { configuredPlatformKeyIds: [] }); });
      expect(await status()).toEqual({ [byKey]: "enabled", [byKeyElsewhere]: "enabled", [byRemovedHostKey]: "disabled" });

      // A business that's no longer the partner's, as once it's released, doesn't keep the key's webhook.
      await asMigrator(tx, async () => { await tx.update(businesses).set({ partnerId: null }).where(eq(businesses.id, dental)); });
      await asWorker(tx, async () => { await disableRemovedPlatformKeyWebhooks(acme.context, { configuredPlatformKeyIds: [] }); });
      expect(await status()).toEqual({ [byKey]: "enabled", [byKeyElsewhere]: "disabled", [byRemovedHostKey]: "disabled" });
      // Turned back on, it goes off with the key all the same.
      await asMigrator(tx, async () => { await tx.update(webhookEndpoints).set({ status: "enabled", disabledReason: null, disabledAt: null }).where(eq(webhookEndpoints.id, byKeyElsewhere)); });

      // The key invites a business's staff, and creates a business, which invites its owner.
      const staff = await asWorker(tx, async () => await createTeamInvitationForApi(acme.context, partnerCaller(resolved, plumbing), { email: "front@plumbing.example", role: "business_admin" }, { platformKeyId: platformKey.id }));
      const harbor = await createPartnerBusinessForApi(acme.context, { key: resolved, idempotencyKey: "harbor", requestHash: "h", body: { name: "Harbor Dental", timezone: "UTC", owner_email: `${randomUUID()}@example.invalid` } });
      const invitationStatus = async () => Object.fromEntries((await asMigrator(tx, async () => await tx.select({ id: businessInvitations.id, role: businessInvitations.role, status: businessInvitations.status }).from(businessInvitations).where(eq(businessInvitations.invitedByPlatformKeyId, platformKey.id)))).map((row) => [row.role, row.status]));
      expect(await invitationStatus()).toEqual({ business_admin: "pending", business_owner: "pending" });

      // Turning webhooks off, or revoking invitations, needs the key revoked first, by an owner or admin of its partner.
      for (const fn of ["disable_revoked_partner_platform_key_webhooks", "revoke_partner_platform_key_invitations"]) {
        expect(await refusal(savepoint(tx, async (inner) => {
          await inner.execute(sql`select set_config('app.user_id', ${acme.ownerActor.userId}, true), set_config('app.business_id', '', true), set_config('app.actor_type', 'operator', true)`);
          return await inner.execute(sql`select * from ${sql.raw(`app.${fn}`)}(${platformKey.id}::uuid)`);
        }))).toMatchObject({ code: "42501" });
      }

      const revoked = await revokePartnerPlatformKey(acme.context, acme.adminActor, { platformKeyId: platformKey.id });
      expect(revoked.platformKey).toMatchObject({ id: platformKey.id, revokedAt: expect.any(String) });
      expect(revoked.disabledWebhookEndpointIds.sort()).toEqual([byKey, byKeyElsewhere].sort());
      // Nobody can accept the staff invitation it sent any more. The owner's invitation stays, since the console can't send another.
      expect(revoked.revokedInvitationIds).toEqual([staff.id]);
      expect(await invitationStatus()).toEqual({ business_admin: "revoked", business_owner: "pending" });
      const [staffAudit] = await asMigrator(tx, async () => await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.entityId, staff.id), eq(auditLogs.eventType, "business_invitation.revoked"))));
      expect(staffAudit).toEqual({ actorUserId: acme.adminActor.userId, payload: { reason: "platform_key_revoked", platformKeyId: platformKey.id } });
      expect(await status()).toEqual({ [byKey]: "disabled", [byKeyElsewhere]: "disabled", [byRemovedHostKey]: "disabled" });
      const audits = await asMigrator(tx, async () => await tx.select({ businessId: auditLogs.businessId, actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.eventType, "webhook_endpoint.disabled"), inArray(auditLogs.entityId, [byKey, byKeyElsewhere]), sql`${auditLogs.payload}->>'reason' = 'platform_key_revoked'`)));
      expect(audits).toHaveLength(2);
      expect(audits[0]).toMatchObject({ actorUserId: acme.adminActor.userId, payload: { reason: "platform_key_revoked", platformKeyId: platformKey.id } });
      const [stored] = await asMigrator(tx, async () => await tx.select({ revokedByUserId: partnerPlatformKeys.revokedByUserId }).from(partnerPlatformKeys).where(eq(partnerPlatformKeys.id, platformKey.id)));
      expect(stored?.revokedByUserId).toBe(acme.adminActor.userId);

      // The key stops working at once, and revoking it again changes nothing.
      expect(await asWorker(tx, async () => await resolvePlatformKey(acme.context, key, {}))).toBeNull();
      const again = await revokePartnerPlatformKey(acme.context, acme.ownerActor, { platformKeyId: platformKey.id });
      expect(again).toEqual({ platformKey: revoked.platformKey, disabledWebhookEndpointIds: [], revokedInvitationIds: [] });
      // A request that resolved the key before the revoke writes nothing after it.
      const manager = { kind: "platform_key", platformKeyId: resolved.platformKeyId, groupId: resolved.group, partnerId: resolved.partnerId } as const;
      for (const attempt of [
        () => asWorker(tx, async () => await savepoint(tx, async (inner) => await createWebhookEndpoint({ db: inner as unknown as Database }, { businessId: plumbing, manager, url: "https://late.example.com/hook", events: ["contact.created"] }))),
        () => asWorker(tx, async () => await savepoint(tx, async (inner) => await createTeamInvitationForApi({ db: inner as unknown as Database }, partnerCaller(resolved, plumbing), { email: "late@plumbing.example", role: "viewer" }, { platformKeyId: platformKey.id }))),
        () => savepoint(tx, async (inner) => await createPartnerBusinessForApi({ db: inner as unknown as Database }, { key: resolved, idempotencyKey: "late", requestHash: "h", body: { name: "Late Spa", timezone: "UTC", owner_email: `${randomUUID()}@example.invalid` } })),
      ]) {
        expect(await refusal(attempt())).toMatchObject({ status: 401, code: "unauthorized" });
      }
      expect(harbor.replayed).toBe(false);
      // A revoked key's webhook turned back on outside the API goes off again at the next start.
      await asMigrator(tx, async () => { await tx.update(webhookEndpoints).set({ status: "enabled" }).where(eq(webhookEndpoints.id, byKey)); });
      await asWorker(tx, async () => { await disableRemovedPlatformKeyWebhooks(acme.context, { configuredPlatformKeyIds: [] }); });
      expect((await status())[byKey]).toBe("disabled");
      expect(await refusal(revokePartnerPlatformKey(acme.context, acme.ownerActor, { platformKeyId: randomUUID() }))).toMatchObject({ status: 404 });
    });
  });
  it("waits for a request still writing with the key, then turns off what it wrote", async () => {
    // Two sessions have to see the same rows here, so this one commits its fixtures and removes them after.
    const userId = randomUUID();
    const partnerId = randomUUID();
    const businessId = randomUUID();
    const platformKeyId = randomUUID();
    const db = client!.db;
    await db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, emailVerified: true });
    await db.insert(partners).values({ id: partnerId, name: "Race Agency", slug: `race-${partnerId.slice(0, 8)}` });
    await db.insert(partnerMembers).values({ partnerId, userId, role: "owner" });
    await db.insert(businesses).values({ id: businessId, slug: `race-${businessId}`, name: "Race Plumbing", timezone: "UTC", businessType: "test", partnerId });
    await db.insert(partnerPlatformKeys).values({ id: platformKeyId, partnerId, name: "Race", prefix: `lsp_${platformKeyId.slice(0, 8)}`, keyHash: sha256(randomUUID()), scopes: ["webhooks:manage"], createdByUserId: userId });
    const manager = { kind: "platform_key", platformKeyId, groupId: partnerId, partnerId } as const;
    const owner: PartnerMemberActor = { kind: "member", partnerId, userId, role: "owner" };
    const asWorkerSession = async <T>(run: (tx: DatabaseTransaction) => Promise<T>) => await db.transaction(async (tx) => {
      await tx.execute(sql`set local session authorization lobbystack_worker`);
      return await run(tx);
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let writer: { pid: number; endpointId: string } | undefined;
    let writing: Promise<void> | undefined;
    let revoking: Promise<Awaited<ReturnType<typeof revokePartnerPlatformKey>>> | undefined;
    try {
      // A request resolved the key and is creating a webhook endpoint with it, in a transaction that hasn't committed yet.
      writing = asWorkerSession(async (tx) => {
        const pid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0]!.pid;
        const created = await createWebhookEndpoint({ db: tx as unknown as Database }, { businessId, manager, url: "https://race.example.com/hook", events: ["contact.created"] });
        writer = { pid, endpointId: created.endpoint.id };
        await held;
      });
      await vi.waitFor(() => expect(writer).toBeDefined(), { timeout: 3000 });
      // The owner revokes the key meanwhile. The revoke waits for the request.
      revoking = db.transaction(async (tx) => {
        await tx.execute(sql`set local role lobbystack_app`);
        return await revokePartnerPlatformKey({ db: tx as unknown as Database }, owner, { platformKeyId });
      });
      await vi.waitFor(async () => {
        const result = await client!.pool.query<{ waiting: number }>("select count(*)::int as waiting from pg_locks where not granted and $1 = any(pg_blocking_pids(pid))", [writer!.pid]);
        expect(result.rows[0]?.waiting).toBeGreaterThan(0);
      }, { timeout: 3000 });
      release();
      await writing;
      // Once the request commits, the revoke turns off the endpoint it created.
      const revoked = await revoking;
      expect(revoked.disabledWebhookEndpointIds).toEqual([writer!.endpointId]);
      const [endpoint] = await db.select({ status: webhookEndpoints.status }).from(webhookEndpoints).where(eq(webhookEndpoints.id, writer!.endpointId));
      expect(endpoint?.status).toBe("disabled");
      // A request after the revoke writes nothing.
      expect(await refusal(asWorkerSession(async (tx) => await createWebhookEndpoint({ db: tx as unknown as Database }, { businessId, manager, url: "https://after.example.com/hook", events: ["contact.created"] })))).toMatchObject({ status: 401, code: "unauthorized" });
      expect(await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(eq(webhookEndpoints.businessId, businessId))).toHaveLength(1);
    } finally {
      release();
      await Promise.allSettled([writing, revoking]);
      await db.delete(businesses).where(eq(businesses.id, businessId));
      await db.delete(partners).where(eq(partners.id, partnerId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
