import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { billingAccounts, businessMemberships, businesses, createDatabaseClient, feedbackSubmissions, onboardingNumberClaimEvents, outboxMessages, partners, phoneNumbers, productEvents, providerEvents, services, storageObjects, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { deleteBusiness } from "./businessDeletion";
import { readActiveBusinessIdInTransaction } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Business deletion integration tests require a dedicated local test database.");
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

/** A direct business named Studio with an owner and an admin, one paid Polar plan, a number, a stored file, and rows the business leaves behind unlinked. */
async function seed(tx: DatabaseTransaction, options: { partnerId?: string } = {}) {
  const businessId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Studio", timezone: "Europe/Belgrade", businessType: "test", telemetryEnabled: false, ...(options.partnerId ? { partnerId: options.partnerId } : {}) });
  const person = async (role: string) => {
    const userId = randomUUID();
    await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await tx.insert(businessMemberships).values({ businessId, userId, role });
    return userId;
  };
  const ownerId = await person("business_owner");
  const adminId = await person("business_admin");
  await tx.insert(services).values({ businessId, name: "Colour", slug: "colour", durationMinutes: 30 });
  await tx.insert(billingAccounts).values({ businessId, billingKey: businessId, plan: "pro", subscriptionId: "sub_1", subscriptionState: "active" });
  const [number] = await tx.insert(phoneNumbers).values({ businessId, e164: `+1555${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, providerPhoneId: `PN${randomUUID()}` }).returning({ id: phoneNumbers.id, providerPhoneId: phoneNumbers.providerPhoneId });
  const objectKey = `test/${randomUUID()}`;
  await tx.insert(storageObjects).values({ businessId, objectKey, purpose: "recording", fileName: "call.mp3", contentType: "audio/mpeg", status: "ready" });
  await tx.insert(providerEvents).values({ provider: "polar", providerEventId: randomUUID(), eventType: "subscription.active", businessId, payload: { phone: "+15550000000" } });
  await tx.insert(productEvents).values({ name: "test", distinctId: "d", businessId, properties: {} });
  await tx.insert(feedbackSubmissions).values({ userId: ownerId, businessId, businessName: "Studio", message: "Hello" });
  const db = tx as unknown as Database;
  // As the application does: through the app role, so RLS and its grants apply.
  const run = async (userId: string, confirmName = "Studio", revokeSubscription: (id: string) => Promise<void> = async () => undefined) => {
    await tx.execute(sql`set local role lobbystack_app`);
    try {
      return await deleteBusiness({ db }, { userId, businessId, confirmName, revokeSubscription });
    } finally {
      await tx.execute(sql`reset role`);
    }
  };
  const exists = async () => (await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId))).length === 1;
  return { businessId, ownerId, adminId, number: number!, objectKey, run, exists };
}

describe.skipIf(!client)("deleting a business as its owner", () => {
  it("wipes the business and the rows that would outlive it, ends its plan, and queues the number and file cleanup", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, ownerId, number, objectKey, run, exists } = await seed(tx);
      const revoke = vi.fn(async () => undefined);
      const { releasedNumbers } = await run(ownerId, " Studio ", revoke);
      expect(revoke).toHaveBeenCalledExactlyOnceWith("sub_1");
      expect(releasedNumbers).toEqual([expect.objectContaining({ id: number.id })]);
      expect(await exists()).toBe(false);
      for (const table of [services, businessMemberships, billingAccounts, phoneNumbers, storageObjects, providerEvents, productEvents, feedbackSubmissions]) {
        expect(await tx.select().from(table).where(eq(table.businessId, businessId))).toEqual([]);
      }
      // The accounts stay: only the place on the business goes.
      expect(await tx.select({ id: users.id }).from(users).where(eq(users.id, ownerId))).toHaveLength(1);
      // The worker's jobs outlive the business, unlinked from it.
      const jobs = await tx.select({ topic: outboxMessages.topic, businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.dedupeKey, `business:${businessId}:delete-stored-objects:0`));
      expect(jobs).toEqual([{ topic: "privacy.deleteStoredObjects", businessId: null, payload: { objectKeys: [objectKey] } }]);
      expect(await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(eq(outboxMessages.dedupeKey, `phone-number:${number.id}:release-deleted`))).toEqual([{ topic: "phoneNumber.releaseDeleted" }]);
    });
  });

  it("leaves everything when the plan can't be ended", async () => {
    await rollbackTest(async (tx) => {
      const { ownerId, run, exists } = await seed(tx);
      await expect(run(ownerId, "Studio", async () => { throw new Error("Polar request failed with status 500."); })).rejects.toThrow("Polar");
      expect(await exists()).toBe(true);
    });
  });

  it("skips the plan when it has already ended", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, ownerId, run, exists } = await seed(tx);
      await tx.update(billingAccounts).set({ subscriptionState: "canceled" }).where(eq(billingAccounts.businessId, businessId));
      const revoke = vi.fn(async () => undefined);
      await run(ownerId, "Studio", revoke);
      expect(revoke).not.toHaveBeenCalled();
      expect(await exists()).toBe(false);
    });
  });

  it("refuses a wrong name, an admin, and a partner's business", async () => {
    await rollbackTest(async (tx) => {
      const { ownerId, adminId, run, exists } = await seed(tx);
      await expect(run(ownerId, "Studios")).rejects.toMatchObject({ status: 400, code: "confirmation_mismatch" });
      await expect(run(adminId)).rejects.toMatchObject({ status: 403, code: "forbidden" });
      expect(await exists()).toBe(true);
    });
    await rollbackTest(async (tx) => {
      const [partner] = await tx.insert(partners).values({ name: "Agency", slug: `agency-${randomUUID().slice(0, 8)}` }).returning({ id: partners.id });
      const { ownerId, run, exists } = await seed(tx, { partnerId: partner!.id });
      await expect(run(ownerId)).rejects.toMatchObject({ status: 403, code: "partner_business" });
      expect(await exists()).toBe(true);
    });
  });

  it("waits while a phone number is being bought for the business", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, ownerId, run, exists } = await seed(tx);
      await tx.insert(onboardingNumberClaimEvents).values({ businessId, userId: ownerId, requestedE164: "+15550001111", selectionContext: {}, claimTokenHash: "hash", idempotencyKey: "key", status: "reserved" });
      await expect(run(ownerId)).rejects.toMatchObject({ status: 409, code: "business_number_in_progress" });
      expect(await exists()).toBe(true);
    });
  });

  it("moves everyone who remembered the business to one of their own, so no request is left naming a business that's gone", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, ownerId, adminId, run } = await seed(tx);
      const otherId = randomUUID();
      await tx.insert(businesses).values({ id: otherId, slug: otherId, name: "Other", timezone: "Europe/Belgrade", businessType: "test", telemetryEnabled: false });
      await tx.insert(businessMemberships).values({ businessId: otherId, userId: ownerId, role: "business_owner" });
      await tx.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, ownerId));
      await tx.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, adminId));
      await run(ownerId);
      const remembered = async (userId: string) => {
        await tx.execute(sql`set local role lobbystack_app`);
        try {
          return await withBusinessTransaction(tx as unknown as Database, { userId, actorType: "operator" }, async (inner) => await readActiveBusinessIdInTransaction(inner, { userId, brand: { kind: "host" } }));
        } finally {
          await tx.execute(sql`reset role`);
        }
      };
      expect(await remembered(ownerId)).toBe(otherId);
      // The admin has no other business, so there is none to open.
      expect(await remembered(adminId)).toBeNull();
    });
  });
});
