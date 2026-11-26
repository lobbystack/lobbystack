import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agents, auditLogs, businesses, createDatabaseClient, phoneNumbers, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { attachExternalNumber, detachExternalNumber, EXTERNAL_CARRIER } from "./externalNumbers";
import { desiredNumberRouting } from "./numberTrials";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("External number integration tests require a dedicated local test database.");
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

const number = "+381211234567";

/** Two businesses, each with its default agent. The domain functions run as the worker role, under row security. */
async function seed(tx: DatabaseTransaction) {
  const db = tx as unknown as Database;
  const business = async (name: string) => {
    const businessId = randomUUID();
    await tx.insert(businesses).values({ id: businessId, slug: businessId, name, timezone: "Europe/Belgrade", businessType: "test", telemetryEnabled: false });
    const [agent] = await tx.insert(agents).values({ businessId, isDefault: true, greeting: "Hi", tone: "warm", bookingPolicy: "Book", transferMode: "never", bookingMode: "instant" }).returning({ id: agents.id });
    return { businessId, agentId: agent!.id };
  };
  const [first, second] = [await business("Javor"), await business("Hrast")];
  const asWorker = async () => { await tx.execute(sql`set local role lobbystack_worker`); };
  const asOwner = async () => { await tx.execute(sql`reset role`); };
  return {
    first,
    second,
    attach: async (businessId: string, e164 = number, agentId?: string) => { await asWorker(); return await attachExternalNumber({ db }, { businessId, e164, ...(agentId ? { agentId } : {}) }); },
    detach: async (businessId: string, e164 = number) => { await asWorker(); return await detachExternalNumber({ db }, { businessId, e164 }); },
    routing: async (businessId: string, phoneNumberId: string) => { await asWorker(); return await desiredNumberRouting({ db }, { businessId, phoneNumberId }); },
    resolve: async (e164 = number) => { await asWorker(); return (await tx.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_phone(${e164}) as business_id`)).rows[0]?.business_id ?? null; },
    rows: async (businessId: string) => { await asOwner(); return await tx.select().from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId)); },
    audits: async (businessId: string) => { await asOwner(); return (await tx.select({ eventType: auditLogs.eventType }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), sql`${auditLogs.eventType} like 'phone_number.external%'`))).map((row) => row.eventType); },
    heldByCarrier: async (businessId: string, e164: string) => { await asOwner(); await tx.insert(phoneNumbers).values({ businessId, agentId: (await tx.select({ id: agents.id }).from(agents).where(eq(agents.businessId, businessId)))[0]!.id, e164, carrier: "twilio", providerPhoneId: `PN${randomUUID()}`, status: "active" }); },
  };
}

describe.skipIf(!client)("an external number", () => {
  it("gives a business a number with no carrier behind it, which the voice webhook finds", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      const attached = await fixture.attach(fixture.first.businessId);

      expect(attached).toMatchObject({ e164: number, agentId: fixture.first.agentId, created: true });
      const [row] = await fixture.rows(fixture.first.businessId);
      expect(row).toMatchObject({ e164: number, carrier: EXTERNAL_CARRIER, providerPhoneId: null, carrierConnectionId: null, status: "active", voiceEnabled: true, smsEnabled: false });
      expect(await fixture.resolve()).toBe(fixture.first.businessId);
      expect(await fixture.audits(fixture.first.businessId)).toEqual(["phone_number.external_attached"]);
    });
  });

  it("is attached once: asking again returns the same number", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      const first = await fixture.attach(fixture.first.businessId);
      const again = await fixture.attach(fixture.first.businessId);

      expect(again).toMatchObject({ phoneNumberId: first.phoneNumberId, created: false });
      expect(await fixture.rows(fixture.first.businessId)).toHaveLength(1);
      expect(await fixture.audits(fixture.first.businessId)).toHaveLength(1);
    });
  });

  it("refuses a number another business holds, or a carrier does, without saying who", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      await fixture.attach(fixture.first.businessId);
      await expect(fixture.attach(fixture.second.businessId)).rejects.toMatchObject({ status: 409, message: "That number is already in use." });

      await fixture.heldByCarrier(fixture.first.businessId, "+381211111111");
      await expect(fixture.attach(fixture.first.businessId, "+381211111111")).rejects.toMatchObject({ status: 409 });
      expect(await fixture.rows(fixture.second.businessId)).toEqual([]);
    });
  });

  it("answers as the agent the operator names, and only one of the business's own", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      await expect(fixture.attach(fixture.first.businessId, number, fixture.second.agentId)).rejects.toMatchObject({ status: 404 });
      await expect(fixture.attach(fixture.first.businessId, number, fixture.first.agentId)).resolves.toMatchObject({ agentId: fixture.first.agentId });
    });
  });

  it("refuses what isn't an E.164 number", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      for (const bad of ["0211234567", "+0211234567", "381211234567", "+38 21 1234567", "+3812"]) {
        await expect(fixture.attach(fixture.first.businessId, bad)).rejects.toMatchObject({ status: 400 });
      }
    });
  });

  it("is left alone by number routing, which has no carrier to move it on", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      const { phoneNumberId } = await fixture.attach(fixture.first.businessId);
      expect(await fixture.routing(fixture.first.businessId, phoneNumberId)).toBeNull();
    });
  });

  it("is detached like a removed number: reclaimed, and free to attach again", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      await fixture.attach(fixture.first.businessId);

      expect(await fixture.detach(fixture.first.businessId)).toBe(true);
      expect(await fixture.detach(fixture.first.businessId)).toBe(false);
      expect(await fixture.resolve()).toBeNull();
      expect(await fixture.audits(fixture.first.businessId)).toEqual(expect.arrayContaining(["phone_number.external_attached", "phone_number.external_detached"]));
      await expect(fixture.attach(fixture.second.businessId)).resolves.toMatchObject({ created: true });
    });
  });

  it("never detaches a number a carrier holds", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      await fixture.heldByCarrier(fixture.first.businessId, "+381211111111");

      expect(await fixture.detach(fixture.first.businessId, "+381211111111")).toBe(false);
      expect((await fixture.rows(fixture.first.businessId))[0]).toMatchObject({ status: "active", carrier: "twilio" });
    });
  });
});
