import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { apiKeys, auditLogs, businesses, businessMemberships, createDatabaseClient, partners, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { AuthorizationError } from "../../authz";
import { createApiKey, listApiKeys, resolveApiKey, revokeApiKey, updateApiKey } from "./apiKeys";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("API key integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

/** Runs a test in one transaction as the app role, and rolls everything it wrote back. */
async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

/** Writes fixtures as the migrator, then works as the app role, as the dashboard does. */
async function fixture(tx: DatabaseTransaction) {
  const person = () => {
    const userId = randomUUID();
    return { id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: `Person ${userId.slice(0, 4)}`, emailVerified: true };
  };
  const [owner, admin, viewer, outsider] = [person(), person(), person(), person()];
  await tx.insert(users).values([owner, admin, viewer, outsider]);
  const business = async (label: string, partnerId: string | null = null) => {
    const businessId = randomUUID();
    await tx.insert(businesses).values({ id: businessId, slug: `keys-${label}-${businessId}`, name: `Keys ${label}`, timezone: "UTC", businessType: "test", partnerId });
    return businessId;
  };
  const salon = await business("salon");
  const other = await business("other");
  const partnerId = randomUUID();
  await tx.insert(partners).values({ id: partnerId, name: "Keys Agency", slug: `keys-${partnerId.slice(0, 8)}` });
  const managed = await business("managed", partnerId);
  await tx.insert(businessMemberships).values([
    { businessId: salon, userId: owner.id, role: "business_owner" },
    { businessId: salon, userId: admin.id, role: "business_admin" },
    { businessId: salon, userId: viewer.id, role: "viewer" },
    { businessId: other, userId: outsider.id, role: "business_owner" },
    { businessId: managed, userId: owner.id, role: "business_owner" },
  ]);
  await tx.execute(sql`set local role lobbystack_app`);
  return { context: { db: tx as unknown as Database }, owner: owner.id, admin: admin.id, viewer: viewer.id, outsider: outsider.id, salon, other, managed };
}

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(() => null, (error: unknown) => error);
}

describe.skipIf(!testUrl)("changing a business's API keys, against PostgreSQL with RLS", () => {
  it("changes a key's name and scopes, keeps the key working with them, and audits the change", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);
      const { apiKey, key } = await createApiKey(f.context, { userId: f.owner, businessId: f.salon, name: "Zapier", scopes: ["calls:read"] });
      const changed = await updateApiKey(f.context, { userId: f.admin, businessId: f.salon, apiKeyId: apiKey.id, name: "  CRM sync ", scopes: ["contacts:write", "calls:read"] });
      // Row-level security shows an admin only their own users row, so the creator's name comes back for the owner alone.
      expect(changed).toEqual({ ...apiKey, name: "CRM sync", scopes: ["calls:read", "contacts:write"], createdBy: { userId: f.owner, name: null, email: null } });
      expect((await listApiKeys(f.context, { userId: f.owner, businessId: f.salon }))[0]).toEqual({ ...changed, createdBy: apiKey.createdBy });
      // The same key keeps working, now with the new scopes.
      expect(await resolveApiKey(f.context, key)).toEqual({ businessId: f.salon, apiKeyId: apiKey.id, scopes: ["calls:read", "contacts:write"] });

      await tx.execute(sql`reset role`);
      const audit = await tx.select().from(auditLogs).where(and(eq(auditLogs.businessId, f.salon), eq(auditLogs.eventType, "api_key.updated")));
      expect(audit).toEqual([expect.objectContaining({ actorUserId: f.admin, entityType: "api_key", entityId: apiKey.id, payload: { prefix: apiKey.prefix, before: { name: "Zapier", scopes: ["calls:read"] }, after: { name: "CRM sync", scopes: ["calls:read", "contacts:write"] } } })]);
    });
  });

  it("lets only owners and admins change a live key of their own business, where the business has API keys", async () => {
    await rollbackTest(async (tx) => {
      const f = await fixture(tx);
      const { apiKey } = await createApiKey(f.context, { userId: f.owner, businessId: f.salon, name: "Zapier", scopes: ["calls:read"] });
      const change = { apiKeyId: apiKey.id, name: "Changed", scopes: ["contacts:read"] };

      expect(await refusal(updateApiKey(f.context, { ...change, userId: f.viewer, businessId: f.salon }))).toBeInstanceOf(AuthorizationError);
      // Another business's owner reaches neither this business nor, through their own, its key.
      expect(await refusal(updateApiKey(f.context, { ...change, userId: f.outsider, businessId: f.salon }))).toBeInstanceOf(AuthorizationError);
      expect(await updateApiKey(f.context, { ...change, userId: f.outsider, businessId: f.other })).toBeNull();
      expect(await updateApiKey(f.context, { ...change, apiKeyId: randomUUID(), userId: f.owner, businessId: f.salon })).toBeNull();
      // A partner's business has no API keys of its own.
      expect(await refusal(updateApiKey(f.context, { ...change, userId: f.owner, businessId: f.managed }))).toBeInstanceOf(AuthorizationError);

      expect(await refusal(updateApiKey(f.context, { ...change, name: " ", userId: f.owner, businessId: f.salon }))).toMatchObject({ status: 400, code: "invalid_request" });
      expect(await refusal(updateApiKey(f.context, { ...change, scopes: [], userId: f.owner, businessId: f.salon }))).toMatchObject({ status: 400, code: "invalid_request" });
      expect(await refusal(updateApiKey(f.context, { ...change, scopes: ["businesses:create"], userId: f.owner, businessId: f.salon }))).toMatchObject({ status: 400, code: "invalid_request" });

      await revokeApiKey(f.context, { userId: f.owner, businessId: f.salon, apiKeyId: apiKey.id });
      expect(await refusal(updateApiKey(f.context, { ...change, userId: f.owner, businessId: f.salon }))).toMatchObject({ status: 409, code: "conflict" });

      await tx.execute(sql`reset role`);
      expect((await tx.select({ name: apiKeys.name, scopes: apiKeys.scopes }).from(apiKeys).where(eq(apiKeys.id, apiKey.id)))[0]).toEqual({ name: "Zapier", scopes: ["calls:read"] });
      expect(await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, f.salon), eq(auditLogs.eventType, "api_key.updated")))).toEqual([]);
    });
  });
});
