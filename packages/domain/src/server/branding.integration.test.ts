import { createHash, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businessMemberships, businesses, createDatabaseClient, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { canSaveInitialBranding, deploymentAppName, getSavedBrandLogo, getSavedBranding, saveInitialBranding } from "./branding";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Branding integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

function isSerializationFailure(error: unknown): boolean {
  const failure = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return failure?.code === "40001" || failure?.cause?.code === "40001";
}

// Other suites commit and delete businesses while these run. A fixed snapshot
// keeps businesses created later from changing the answer, and a business
// deleted mid-fixture only fails the snapshot, so that attempt starts over.
async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client!.db.transaction(async (tx) => {
        await run(tx);
        throw rollback;
      }, { isolationLevel: "repeatable read" });
    } catch (error) {
      if (error === rollback) return;
      if (attempt < 3 && isSerializationFailure(error)) continue;
      throw error;
    }
  }
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/**
 * A person who signed up on a deployment with no branding saved yet, and a
 * business of their own. With `everyBusinessAs` they hold that role in every
 * business the snapshot holds, as the first owner of a fresh deployment does;
 * with null someone else's business runs here too.
 */
async function seed(tx: DatabaseTransaction, { everyBusinessAs }: { everyBusinessAs: "business_owner" | "viewer" | null }) {
  await tx.execute(sql`reset role`);
  await tx.execute(sql`delete from public.deployment_branding`);
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  const addBusiness = async (memberId: string, role: string) => {
    const businessId = randomUUID();
    await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Test shop", timezone: "UTC", businessType: "test", telemetryEnabled: false });
    await tx.insert(businessMemberships).values({ businessId, userId: memberId, role });
  };
  if (everyBusinessAs) {
    await tx.execute(sql`insert into public.business_memberships (business_id, user_id, role) select id, ${userId}, ${everyBusinessAs} from public.businesses on conflict do nothing`);
    await addBusiness(userId, everyBusinessAs);
  } else {
    const otherId = randomUUID();
    await tx.insert(users).values({ id: otherId, email: `${otherId}@example.invalid`, normalizedEmail: `${otherId}@example.invalid` });
    await addBusiness(userId, "business_owner");
    await addBusiness(otherId, "business_owner");
  }
  const db = tx as unknown as Database;
  const as = async (role: "lobbystack_app" | "lobbystack_worker") => { await tx.execute(sql.raw(`set local role ${role}`)); };
  return {
    userId,
    canSave: async () => {
      await as("lobbystack_app");
      return await canSaveInitialBranding({ db }, { userId });
    },
    save: async (input: { appName?: string | null; logo?: Uint8Array | null }) => {
      await as("lobbystack_app");
      return await saveInitialBranding({ db }, { userId, ...input });
    },
    saved: async () => {
      await as("lobbystack_app");
      return await getSavedBranding(db);
    },
    logo: async () => {
      await as("lobbystack_worker");
      return await getSavedBrandLogo(db);
    },
    // The name text messages give, as the worker role reads it.
    textName: async (environment: Record<string, string | undefined> = {}) => {
      await as("lobbystack_worker");
      return await deploymentAppName(db, environment);
    },
    // A statement that must fail, in a savepoint so the fixture carries on.
    refuses: async (role: "lobbystack_app" | "lobbystack_worker", statement: ReturnType<typeof sql>) => {
      await expect(tx.transaction(async (savepoint) => {
        await savepoint.execute(sql.raw(`set local role ${role}`));
        await savepoint.execute(statement);
      })).rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
    },
  };
}

describe.skipIf(!testUrl)("deployment branding", () => {
  it("lets the first owner choose the name and logo once", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { everyBusinessAs: "business_owner" });
      expect(await fixture.canSave()).toBe(true);
      expect(await fixture.textName()).toBe("LobbyStack");
      await fixture.save({ appName: "  Acme Desk ", logo: png });
      expect(await fixture.textName()).toBe("Acme Desk");
      expect(await fixture.textName({ BRAND_APP_NAME: "Front Desk" })).toBe("Front Desk");
      expect(await fixture.saved()).toEqual({ appName: "Acme Desk", logoVersion: createHash("sha256").update(png).digest("hex") });
      const logo = await fixture.logo();
      expect(logo && new Uint8Array(logo.bytes)).toEqual(png);
      expect(logo?.contentType).toBe("image/png");
      expect(await fixture.canSave()).toBe(false);
      await expect(fixture.save({ appName: "Second try" })).rejects.toMatchObject({ status: 409, code: "branding_already_saved" });
      expect((await fixture.saved())?.appName).toBe("Acme Desk");
    });
  });

  it("ends the choice and keeps the defaults when the owner skips it", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { everyBusinessAs: "business_owner" });
      await fixture.save({ appName: " ", logo: null });
      expect(await fixture.saved()).toEqual({ appName: null, logoVersion: null });
      expect(await fixture.logo()).toBeNull();
      expect(await fixture.canSave()).toBe(false);
    });
  });

  it("refuses someone on a deployment that already serves another person's business", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { everyBusinessAs: null });
      expect(await fixture.canSave()).toBe(false);
      await expect(fixture.save({ appName: "Hijack" })).rejects.toMatchObject({ status: 403, code: "branding_not_allowed" });
      expect(await fixture.saved()).toBeNull();
    });
  });

  it("refuses someone who belongs to every business without owning them", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { everyBusinessAs: "viewer" });
      expect(await fixture.canSave()).toBe(false);
      await expect(fixture.save({ appName: "Viewer" })).rejects.toMatchObject({ status: 403, code: "branding_not_allowed" });
    });
  });

  it("checks the name and logo before saving anything", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { everyBusinessAs: "business_owner" });
      await expect(fixture.save({ appName: "x".repeat(41) })).rejects.toMatchObject({ status: 400, code: "invalid_app_name" });
      await expect(fixture.save({ logo: new TextEncoder().encode("<html><script>alert(1)</script></html>") })).rejects.toMatchObject({ status: 400, code: "invalid_logo" });
      await expect(fixture.save({ logo: new Uint8Array(256 * 1024 + 1) })).rejects.toMatchObject({ status: 413, code: "logo_too_large" });
      expect(await fixture.saved()).toBeNull();
      expect(await fixture.canSave()).toBe(true);
    });
  });

  it("lets runtime roles read the branding but write it only through the onboarding function", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { everyBusinessAs: "business_owner" });
      await fixture.refuses("lobbystack_app", sql`insert into public.deployment_branding (id, app_name) values (1, 'Direct')`);
      await fixture.refuses("lobbystack_worker", sql`select app.save_initial_branding('Worker', null, null)`);
      // A context naming another actor than an operator is refused too.
      await tx.execute(sql`set local role lobbystack_app`);
      await tx.execute(sql`select set_config('app.user_id', ${fixture.userId}, true), set_config('app.actor_type', 'system', true)`);
      const outcome = await tx.execute<{ outcome: string }>(sql`select app.save_initial_branding('System', null, null) as outcome`);
      expect(outcome.rows[0]?.outcome).toBe("not_allowed");
      expect(await fixture.saved()).toBeNull();
    });
  });
});
