import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, businessMemberships, contacts, createDatabaseClient, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { listContacts } from "./contacts";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Contact search integration tests require a dedicated local test database.");
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

/** A business with three contacts, searched by its admin under RLS. */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone: "UTC", businessType: "test", telemetryEnabled: false });
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_admin" });
  await tx.insert(contacts).values([
    { businessId, name: "Milan Obrenovic", phone: "+14165550100", email: "milan@example.com" },
    { businessId, name: "Ana Pct% Match", phone: "+14165550111" },
    { businessId, name: "Sam", phone: "+442071838750", email: "sam@example.org" },
  ]);
  const db = tx as unknown as Database;
  return async (search: string) => {
    await tx.execute(sql`set local role lobbystack_app`);
    return (await listContacts({ db }, { userId, businessId, search })).contacts.map((contact) => contact.name).sort();
  };
}

describe.skipIf(!client)("searching contacts", () => {
  it("finds a phone number however it is written", async () => {
    await rollbackTest(async (tx) => {
      const search = await seed(tx);
      expect(await search("416 555")).toEqual(["Ana Pct% Match", "Milan Obrenovic"]);
      expect(await search("(416) 555-0100")).toEqual(["Milan Obrenovic"]);
      expect(await search("+1 416 555 0100")).toEqual(["Milan Obrenovic"]);
      expect(await search("020 7183")).toEqual([]);
      expect(await search("+44 20 7183")).toEqual(["Sam"]);
    });
  });

  it("needs every word, in the name, phone or email", async () => {
    await rollbackTest(async (tx) => {
      const search = await seed(tx);
      expect(await search("obrenovic milan")).toEqual(["Milan Obrenovic"]);
      expect(await search("milan example")).toEqual(["Milan Obrenovic"]);
      expect(await search("milan sam")).toEqual([]);
    });
  });

  it("reads % and _ as the characters they are", async () => {
    await rollbackTest(async (tx) => {
      const search = await seed(tx);
      expect(await search("pct%")).toEqual(["Ana Pct% Match"]);
      expect(await search("%")).toEqual(["Ana Pct% Match"]);
      expect(await search("_")).toEqual([]);
    });
  });
});
