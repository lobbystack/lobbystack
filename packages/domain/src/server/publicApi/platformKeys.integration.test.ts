import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { apiKeys, auditLogs, businessMemberships, businesses, contacts, createDatabaseClient, idempotencyKeys, outboxMessages, platformPartnerBusinesses, receptionistProfiles, staff, users } from "@lobbystack/db";

import { generateApiKey, resolveApiKey } from "./apiKeys";
import { PublicApiError } from "./errors";
import { runIdempotent } from "./idempotency";
import { createBusinessForApi, createContactForApi, createKnowledgeEntryForApi, getPlatformMeForApi, listBusinessesForApi, platformBusinessId, resolveActingUserId, type ApiKeyCaller, type PlatformKeyCaller } from "./operations";
import { generatePlatformKey, linkPlatformPartnerBusiness, requirePlatformBusinessAccess, resolvePlatformKey, resolvePlatformKeyOwner } from "./platformKeys";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Platform key integration tests require a dedicated local test database.");
  }
}

// The admin serves /api/v1 with the lobbystack_worker role; run the same role here.
function roleUrl(role: string): string {
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c role=${role}`);
  return url.toString();
}

const admin = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
const worker = testUrl ? createDatabaseClient("lobbystack_worker", { DATABASE_URL: roleUrl("lobbystack_worker") }) : undefined;
const app = testUrl ? createDatabaseClient("lobbystack_app", { DATABASE_URL: roleUrl("lobbystack_app") }) : undefined;

const businessA = randomUUID();
const businessB = randomUUID();
const ownerId = randomUUID();
const ownerEmail = `platform-owner-${ownerId}@example.invalid`;
const unverifiedId = randomUUID();
const unverifiedEmail = `platform-unverified-${unverifiedId}@example.invalid`;
const memberId = randomUUID();
const createdBusinessIds: string[] = [];

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(() => null, (value: unknown) => value);
  expect(error).toBeInstanceOf(PublicApiError);
  expect(error).toMatchObject({ status, code });
}

describe.skipIf(!testUrl)("platform keys against PostgreSQL with RLS", () => {
  beforeAll(async () => {
    await admin!.db.insert(businesses).values([
      { id: businessA, slug: `platform-a-${businessA}`, name: "Partner Business", timezone: "UTC", businessType: "test" },
      { id: businessB, slug: `platform-b-${businessB}`, name: "Someone Else", timezone: "UTC", businessType: "test" },
    ]);
    await admin!.db.insert(users).values([
      { id: ownerId, email: ownerEmail, normalizedEmail: ownerEmail, emailVerified: true },
      { id: unverifiedId, email: unverifiedEmail, normalizedEmail: unverifiedEmail },
      { id: memberId, email: `${memberId}@example.invalid`, normalizedEmail: `${memberId}@example.invalid` },
    ]);
    await admin!.db.insert(businessMemberships).values({ businessId: businessA, userId: memberId, role: "business_owner" });
  });

  afterAll(async () => {
    const ids = [businessA, businessB, ...createdBusinessIds];
    await admin?.db.delete(idempotencyKeys).where(inArray(idempotencyKeys.businessId, ids));
    await admin?.db.delete(contacts).where(inArray(contacts.businessId, ids));
    await admin?.db.delete(outboxMessages).where(inArray(outboxMessages.businessId, ids));
    await admin?.db.delete(businesses).where(inArray(businesses.id, ids));
    await admin?.db.delete(users).where(inArray(users.id, [ownerId, unverifiedId, memberId]));
    await Promise.all([admin?.pool.end(), worker?.pool.end(), app?.pool.end()]);
  });

  it("maps a key's owner_email to its account, ignoring case and spaces", async () => {
    const context = { db: worker!.db };
    expect(await resolvePlatformKeyOwner(context, ownerEmail)).toBe(ownerId);
    expect(await resolvePlatformKeyOwner(context, `  ${ownerEmail.toUpperCase()} `)).toBe(ownerId);
    expect(await resolvePlatformKeyOwner(context, "nobody@example.invalid")).toBeNull();
    // Someone who signs up with an owner_email but never verifies it is not the owner.
    expect(await resolvePlatformKeyOwner(context, unverifiedEmail)).toBeNull();
  });

  it("lets only the worker role look owners up", async () => {
    const error = await app!.db.execute(sql`select app.resolve_platform_key_owner(${ownerEmail})`).then(() => null, (value: unknown) => value);
    expect(String((error as { cause?: unknown } | null)?.cause ?? error)).toMatch(/permission denied/);
  });

  it("lets a partner key reach only the businesses linked to its partner", async () => {
    const context = { db: worker!.db };
    await expectApiError(requirePlatformBusinessAccess(context, { businessId: businessA, partnerId: "acme", access: "partner" }), 404, "not_found");
    await linkPlatformPartnerBusiness(context, { businessId: businessA, partnerId: "acme", platformKeyId: randomUUID() });
    // Linking again is a no-op.
    await linkPlatformPartnerBusiness(context, { businessId: businessA, partnerId: "acme", platformKeyId: randomUUID() });
    await requirePlatformBusinessAccess(context, { businessId: businessA, partnerId: "acme", access: "partner" });
    await expectApiError(requirePlatformBusinessAccess(context, { businessId: businessB, partnerId: "acme", access: "partner" }), 404, "not_found");
    await expectApiError(requirePlatformBusinessAccess(context, { businessId: businessA, partnerId: "other", access: "partner" }), 404, "not_found");
    await expectApiError(requirePlatformBusinessAccess(context, { businessId: randomUUID(), partnerId: "acme", access: "all" }), 404, "not_found");
  });

  it("lets a key with access all reach any active business", async () => {
    const context = { db: worker!.db };
    await requirePlatformBusinessAccess(context, { businessId: businessB, partnerId: "lobbystack", access: "all" });
    await admin!.db.update(businesses).set({ status: "suspended" }).where(eq(businesses.id, businessB));
    await expectApiError(requirePlatformBusinessAccess(context, { businessId: businessB, partnerId: "lobbystack", access: "all" }), 404, "not_found");
    await admin!.db.update(businesses).set({ status: "active" }).where(eq(businesses.id, businessB));
  });

  it("shows members which partner manages their business and lets only the worker link one", async () => {
    const visible = await app!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.business_id', ${businessA}, true), set_config('app.user_id', ${memberId}, true), set_config('app.actor_type', 'operator', true)`);
      return await tx.select({ partnerId: platformPartnerBusinesses.partnerId }).from(platformPartnerBusinesses).where(eq(platformPartnerBusinesses.businessId, businessA));
    });
    expect(visible).toEqual([{ partnerId: "acme" }]);
    const insert = await app!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.business_id', ${businessA}, true), set_config('app.user_id', ${memberId}, true), set_config('app.actor_type', 'operator', true)`);
      await tx.insert(platformPartnerBusinesses).values({ businessId: businessA, partnerId: "sneaky" });
    }).then(() => null, (value: unknown) => value);
    expect(String((insert as { cause?: unknown } | null)?.cause ?? insert)).toMatch(/permission denied/);
    // A worker scoped to business B cannot link business A.
    const crossTenant = await worker!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.business_id', ${businessB}, true), set_config('app.actor_type', 'worker', true)`);
      await tx.insert(platformPartnerBusinesses).values({ businessId: businessA, partnerId: "sneaky" });
    }).then(() => null, (value: unknown) => value);
    expect(String((crossTenant as { cause?: unknown } | null)?.cause ?? crossTenant)).toMatch(/row-level security/);
  });

  it("reports the platform key, its partner and the header's business on GET /me", async () => {
    const { key, entry } = generatePlatformKey({ name: "Acme onboarding", partner: "acme", ownerEmail });
    const resolved = resolvePlatformKey(key, { PLATFORM_API_KEYS: JSON.stringify([entry]) })!;
    const caller: PlatformKeyCaller = { businessId: businessA, platformKeyId: resolved.platformKeyId, partnerId: "acme", actingUserId: ownerId, actor: "platform_key" };
    const context = { db: worker!.db };
    expect(await getPlatformMeForApi(context, resolved, caller)).toEqual({
      api_key: { id: entry.id, name: "Acme onboarding", prefix: entry.prefix, scopes: resolved.scopes, created_at: entry.created_at },
      business: { id: businessA, name: "Partner Business" },
      platform: { partner: "acme", access: "partner" },
    });
    expect((await getPlatformMeForApi(context, resolved, null)).business).toBeNull();
  });

  it("audits a platform key's change with the key, its partner and its owner", async () => {
    const platformKeyId = randomUUID();
    const caller: PlatformKeyCaller = { businessId: businessA, platformKeyId, partnerId: "acme", actingUserId: ownerId, actor: "platform_key" };
    const entry = await createKnowledgeEntryForApi({ db: worker!.db }, caller, { type: "faq", question: "Do you park?", answer: "Yes, behind the building." });
    const [row] = await admin!.db.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, businessA), eq(auditLogs.entityId, entry.id)));
    expect(row).toEqual({ actorUserId: null, payload: { actor: "platform_key", platformKeyId, partnerId: "acme", actingUserId: ownerId, type: "faq" } });
  });

  it("keeps a platform key's Idempotency-Keys apart per business", async () => {
    const context = { db: worker!.db };
    const principal = `platform:${randomUUID()}`;
    const run = (businessId: string, phone: string) => async (transactional: typeof context) => ({ status: 201, body: JSON.stringify({ data: await createContactForApi(transactional, { businessId, apiKeyId: randomUUID() }, { phone }) }) });
    // The request pipeline adds the business to a platform key's scope.
    expect((await runIdempotent(context, { businessId: businessA, apiKeyId: `${principal}:${businessA}`, operation: "createContact", key: "same" }, "hash-a", run(businessA, "+14165557001"))).replayed).toBe(false);
    expect((await runIdempotent(context, { businessId: businessB, apiKeyId: `${principal}:${businessB}`, operation: "createContact", key: "same" }, "hash-b", run(businessB, "+14165557002"))).replayed).toBe(false);
    // Without it, the second business would be stuck behind the first one's record.
    await expectApiError(runIdempotent(context, { businessId: businessB, apiKeyId: `${principal}:${businessA}`, operation: "createContact", key: "same" }, "hash-b", run(businessB, "+14165557003")), 409, "idempotency_request_in_progress");
  });

  it("never lets a per-business key act with a platform-only scope", async () => {
    const generated = generateApiKey();
    await admin!.db.insert(apiKeys).values({ businessId: businessA, name: "Seeded with every scope", prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["business:read", "businesses:create", "users:create"] });
    expect((await resolveApiKey({ db: worker!.db }, generated.key))?.scopes).toEqual(["business:read"]);
  });

  describe("businesses created by a platform key", () => {
    const { key, entry } = generatePlatformKey({ name: "Acme onboarding", partner: "acme", ownerEmail });
    const resolved = () => resolvePlatformKey(key, { PLATFORM_API_KEYS: JSON.stringify([entry]) })!;
    const create = (idempotencyKey: string, body: Parameters<typeof createBusinessForApi>[1]["body"], requestHash = `hash-${idempotencyKey}`) =>
      createBusinessForApi({ db: worker!.db }, { key: resolved(), actingUserId: ownerId, idempotencyKey, requestHash, body });

    it("creates the business as the key's owner and links it to the key's partner", async () => {
      const idempotencyKey = `onboard-${randomUUID()}`;
      const result = await create(idempotencyKey, { name: " Acme Plumbing ", timezone: "america/toronto", locale: "fr", website_url: "https://acme.example" });
      createdBusinessIds.push(result.business.id);
      expect(result.replayed).toBe(false);
      expect(result.business).toMatchObject({ id: platformBusinessId(entry.id, idempotencyKey), name: "Acme Plumbing", timezone: "America/Toronto", locale: "fr", website_url: "https://acme.example", business_type: "service_company", onboarding_stage: "website" });
      const businessId = result.business.id;
      expect(await admin!.db.select({ userId: businessMemberships.userId, role: businessMemberships.role }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId))).toEqual([{ userId: ownerId, role: "business_owner" }]);
      expect(await admin!.db.select({ partnerId: platformPartnerBusinesses.partnerId, createdBy: platformPartnerBusinesses.createdByPlatformKeyId }).from(platformPartnerBusinesses).where(eq(platformPartnerBusinesses.businessId, businessId))).toEqual([{ partnerId: "acme", createdBy: entry.id }]);
      expect(await admin!.db.select({ id: staff.id }).from(staff).where(eq(staff.businessId, businessId))).toHaveLength(1);
      expect(await admin!.db.select({ id: receptionistProfiles.businessId }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId))).toHaveLength(1);
      const [audit] = await admin!.db.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "api.business.created")));
      expect(audit?.payload).toEqual({ actor: "platform_key", platformKeyId: entry.id, partnerId: "acme", actingUserId: ownerId, requestHash: `hash-${idempotencyKey}` });
      expect(await admin!.db.select({ topic: outboxMessages.topic }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "snapshot.refresh")))).not.toHaveLength(0);
      // The partner's keys can act on it right away.
      await requirePlatformBusinessAccess({ db: worker!.db }, { businessId, partnerId: "acme", access: "partner" });
    });

    it("returns the same business for a retry and refuses a different body with the same key", async () => {
      const idempotencyKey = `retry-${randomUUID()}`;
      const first = await create(idempotencyKey, { name: "Retry Dental", timezone: "UTC" });
      createdBusinessIds.push(first.business.id);
      const again = await create(idempotencyKey, { name: "Retry Dental", timezone: "UTC" });
      expect(again).toEqual({ business: first.business, replayed: true });
      // A name no fixture uses, so the check sees only what the refused retry might have made.
      const otherName = `Refused Retry ${randomUUID()}`;
      await expectApiError(create(idempotencyKey, { name: otherName, timezone: "UTC" }, "a-different-hash"), 422, "idempotency_key_reused");
      expect(await admin!.db.select({ id: businesses.id }).from(businesses).where(eq(businesses.name, otherName))).toEqual([]);
    });

    it("creates one business when two retries run at once", async () => {
      const idempotencyKey = `race-${randomUUID()}`;
      const results = await Promise.all([create(idempotencyKey, { name: "Race Clinic", timezone: "UTC" }), create(idempotencyKey, { name: "Race Clinic", timezone: "UTC" })]);
      createdBusinessIds.push(results[0].business.id);
      expect(results[1].business.id).toBe(results[0].business.id);
      expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
      expect(await admin!.db.select({ id: businesses.id }).from(businesses).where(eq(businesses.name, "Race Clinic"))).toHaveLength(1);
    });

    it("answers a retry for a business that was since suspended with 404, like every other endpoint", async () => {
      const idempotencyKey = `paused-${randomUUID()}`;
      const first = await create(idempotencyKey, { name: "Paused Spa", timezone: "UTC" });
      createdBusinessIds.push(first.business.id);
      await admin!.db.update(businesses).set({ status: "suspended" }).where(eq(businesses.id, first.business.id));
      await expectApiError(create(idempotencyKey, { name: "Paused Spa", timezone: "UTC" }), 404, "not_found");
    });

    it("refuses a slug another business uses", async () => {
      const [taken] = await admin!.db.select({ slug: businesses.slug }).from(businesses).where(eq(businesses.id, businessA));
      await expectApiError(create(`slug-${randomUUID()}`, { name: "Copycat", timezone: "UTC", slug: taken!.slug }), 409, "conflict");
    });

    it("lists only the partner's active businesses, newest first, a page at a time", async () => {
      const otherKey = generatePlatformKey({ name: "Other onboarding", partner: "other", ownerEmail });
      const other = await createBusinessForApi({ db: worker!.db }, { key: resolvePlatformKey(otherKey.key, { PLATFORM_API_KEYS: JSON.stringify([otherKey.entry]) })!, actingUserId: ownerId, idempotencyKey: `other-${randomUUID()}`, requestHash: "h", body: { name: "Other Partner Co", timezone: "UTC" } });
      createdBusinessIds.push(other.business.id);
      const suspended = await create(`suspended-${randomUUID()}`, { name: "Closed Shop", timezone: "UTC" });
      createdBusinessIds.push(suspended.business.id);
      await admin!.db.update(businesses).set({ status: "suspended" }).where(eq(businesses.id, suspended.business.id));

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await listBusinessesForApi({ db: worker!.db }, { partnerId: "acme", limit: 1, ...(cursor ? { cursor } : {}) });
        expect(page.data.length).toBeLessThanOrEqual(1);
        seen.push(...page.data.map((business) => business.id));
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      const expected = await admin!.db.select({ id: businesses.id, createdAt: businesses.createdAt }).from(platformPartnerBusinesses).innerJoin(businesses, eq(businesses.id, platformPartnerBusinesses.businessId)).where(and(eq(platformPartnerBusinesses.partnerId, "acme"), eq(businesses.status, "active")));
      expect(seen).toEqual(expected.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (y.id < x.id ? -1 : 1)).map((row) => row.id));
      expect(seen).not.toContain(other.business.id);
      expect(seen).not.toContain(suspended.business.id);
      expect(seen.length).toBeGreaterThanOrEqual(3);
    });

    it("lets only the worker list a partner's businesses", async () => {
      const denied = await app!.db.execute(sql`select * from app.list_platform_partner_businesses('acme', null, null, 10)`).then(() => null, (value: unknown) => value);
      expect(String((denied as { cause?: unknown } | null)?.cause ?? denied)).toMatch(/permission denied/);
      // The worker role still gets nothing outside a worker context.
      const rows = await worker!.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.actor_type', 'operator', true)`);
        return (await tx.execute(sql`select business_id from app.list_platform_partner_businesses('acme', null, null, 10)`)).rows;
      });
      expect(rows).toEqual([]);
    });
  });

  it("acts as a per-business key's creator only while they own or run the business", async () => {
    const generated = generateApiKey();
    const [key] = await admin!.db.insert(apiKeys).values({ businessId: businessA, name: "Zapier", prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["business:read"], createdByUserId: memberId }).returning({ id: apiKeys.id });
    const caller: ApiKeyCaller = { businessId: businessA, apiKeyId: key!.id };
    const context = { db: worker!.db };
    expect(await resolveActingUserId(context, caller)).toBe(memberId);
    await admin!.db.update(businessMemberships).set({ role: "viewer" }).where(and(eq(businessMemberships.businessId, businessA), eq(businessMemberships.userId, memberId)));
    await expectApiError(resolveActingUserId(context, caller), 403, "key_owner_inactive");
    await admin!.db.update(businessMemberships).set({ role: "business_owner" }).where(and(eq(businessMemberships.businessId, businessA), eq(businessMemberships.userId, memberId)));
    await admin!.db.update(apiKeys).set({ createdByUserId: null }).where(eq(apiKeys.id, key!.id));
    await expectApiError(resolveActingUserId(context, caller), 403, "key_owner_inactive");
    // A platform key acts as its resolved owner without another lookup.
    expect(await resolveActingUserId(context, { businessId: businessA, platformKeyId: randomUUID(), partnerId: "acme", actingUserId: ownerId, actor: "platform_key" })).toBe(ownerId);
  });
});
