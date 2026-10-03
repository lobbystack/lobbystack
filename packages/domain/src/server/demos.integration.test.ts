import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businessMemberships, businesses, createDatabaseClient, prospectDemos, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { claimProspectDemo, createProspectDemo, expireProspectDemos, getProspectDemoStatus, listProspectDemos, revokeProspectDemo } from "./demos";
import { getActiveOnboardingState } from "./onboarding";
import { createBusiness, listUserBusinesses, switchWorkspace } from "./tenancy";

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

const cleanupMigration = fileURLToPath(new URL("../../../db/migrations/0072_detach_closed_prospect_demo_operators.sql", import.meta.url));

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

const asDb = (tx: DatabaseTransaction) => tx as unknown as Database;

// Runs a domain call as the admin runtime role, then returns to the fixture owner.
async function asApp<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local role lobbystack_app`);
  const result = await run();
  await tx.execute(sql`reset role`);
  return result;
}

async function insertUser(tx: DatabaseTransaction): Promise<string> {
  const id = randomUUID();
  const email = `${id}@example.invalid`;
  await tx.insert(users).values({ id, email, normalizedEmail: email, name: "Demo Tester" });
  return id;
}

// The operator has its own workspace, like the production demo account.
async function operatorWithWorkspace(tx: DatabaseTransaction) {
  const operatorUserId = await insertUser(tx);
  const { businessId: ownBusinessId } = await asApp(tx, () => createBusiness({ db: asDb(tx) }, { userId: operatorUserId, name: `Own ${randomUUID()}`, timezone: "UTC", businessType: "test" }));
  return { operatorUserId, ownBusinessId };
}

async function createDemo(tx: DatabaseTransaction, operatorUserId: string) {
  return await asApp(tx, () => createProspectDemo({ db: asDb(tx) }, { operatorUserId, name: `Demo ${randomUUID()}`, websiteUrl: "https://example.com", suggestedPrompts: ["What do you offer?", "Can I get a quote?"] }));
}

async function membership(tx: DatabaseTransaction, businessId: string, userId: string) {
  return (await tx.select({ status: businessMemberships.status, role: businessMemberships.role, updatedAt: businessMemberships.updatedAt }).from(businessMemberships).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.userId, userId))).limit(1))[0];
}

async function activeBusinessId(tx: DatabaseTransaction, userId: string) {
  return (await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId)).limit(1))[0]?.activeBusinessId ?? null;
}

async function demoRow(tx: DatabaseTransaction, demoId: string) {
  return (await tx.select().from(prospectDemos).where(eq(prospectDemos.id, demoId)).limit(1))[0];
}

async function switcherBusinessIds(tx: DatabaseTransaction, userId: string) {
  return (await asApp(tx, () => listUserBusinesses(asDb(tx), userId))).map((row) => row.businessId);
}

describe.skipIf(!testUrl)("prospect demo operator membership against dedicated PostgreSQL roles", () => {
  it("removes the operator from a revoked demo and keeps the demo in its demo list", async () => {
    await rollbackTest(async (tx) => {
      const { operatorUserId, ownBusinessId } = await operatorWithWorkspace(tx);
      const demo = await createDemo(tx, operatorUserId);
      await asApp(tx, () => switchWorkspace({ db: asDb(tx) }, { userId: operatorUserId, businessId: demo.businessId }));
      expect(await switcherBusinessIds(tx, operatorUserId)).toContain(demo.businessId);

      await asApp(tx, () => revokeProspectDemo({ db: asDb(tx) }, { operatorUserId, demoId: demo.demoId }));

      expect(await membership(tx, demo.businessId, operatorUserId)).toMatchObject({ status: "removed", role: "business_owner" });
      expect(await membership(tx, ownBusinessId, operatorUserId)).toMatchObject({ status: "active" });
      expect(await activeBusinessId(tx, operatorUserId)).toBeNull();
      expect(await switcherBusinessIds(tx, operatorUserId)).toEqual([ownBusinessId]);
      expect(await asApp(tx, () => getActiveOnboardingState(asDb(tx), operatorUserId))).toEqual({ businessId: ownBusinessId, stage: "website" });

      const listed = await asApp(tx, () => listProspectDemos({ db: asDb(tx) }, operatorUserId));
      expect(listed.map((row) => [row.demoId, row.status])).toEqual([[demo.demoId, "revoked"]]);
      expect(await asApp(tx, () => getProspectDemoStatus({ db: asDb(tx) }, { operatorUserId, demoId: demo.demoId }))).toMatchObject({ businessId: demo.businessId, status: "revoked" });
      expect((await tx.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, demo.businessId)))[0]?.status).toBe("active");

      // Revoking again is harmless.
      await asApp(tx, () => revokeProspectDemo({ db: asDb(tx) }, { operatorUserId, demoId: demo.demoId }));
      expect(await membership(tx, demo.businessId, operatorUserId)).toMatchObject({ status: "removed" });
    });
  });

  it("removes the operator from demos the expiry sweep closes", async () => {
    await rollbackTest(async (tx) => {
      const { operatorUserId, ownBusinessId } = await operatorWithWorkspace(tx);
      const expiring = await createDemo(tx, operatorUserId);
      const live = await createDemo(tx, operatorUserId);
      await asApp(tx, () => switchWorkspace({ db: asDb(tx) }, { userId: operatorUserId, businessId: expiring.businessId }));
      await tx.update(prospectDemos).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(prospectDemos.id, expiring.demoId));

      // Past expiry but not yet swept, the demo already drops out of the switcher.
      expect(await switcherBusinessIds(tx, operatorUserId)).not.toContain(expiring.businessId);

      await tx.execute(sql`set local role lobbystack_worker`);
      const expired = await expireProspectDemos({ db: asDb(tx) });
      await tx.execute(sql`reset role`);

      expect(expired).toBeGreaterThanOrEqual(1);
      expect((await demoRow(tx, expiring.demoId))?.status).toBe("revoked");
      expect(await membership(tx, expiring.businessId, operatorUserId)).toMatchObject({ status: "removed" });
      expect(await activeBusinessId(tx, operatorUserId)).toBeNull();
      expect(await membership(tx, live.businessId, operatorUserId)).toMatchObject({ status: "active" });
      expect(new Set(await switcherBusinessIds(tx, operatorUserId))).toEqual(new Set([ownBusinessId, live.businessId]));

      // listProspectDemos reads statuses in parallel, which one test connection
      // cannot do, so read the same resolver and statuses one at a time.
      const listedIds = await asApp(tx, async () => {
        await tx.execute(sql`select set_config('app.user_id', ${operatorUserId}, true), set_config('app.business_id', '', true), set_config('app.actor_type', 'system', true)`);
        return (await tx.execute<{ demo_id: string }>(sql`select demo_id from app.list_operator_prospect_demos()`)).rows.map((row) => row.demo_id);
      });
      expect(new Set(listedIds)).toEqual(new Set([expiring.demoId, live.demoId]));
      expect(await asApp(tx, () => getProspectDemoStatus({ db: asDb(tx) }, { operatorUserId, demoId: expiring.demoId }))).toMatchObject({ status: "revoked" });
    });
  });

  it("still hands a claimed demo to the prospect and clears the operator's active business", async () => {
    await rollbackTest(async (tx) => {
      const { operatorUserId, ownBusinessId } = await operatorWithWorkspace(tx);
      const claimantUserId = await insertUser(tx);
      const demo = await createDemo(tx, operatorUserId);
      await tx.update(prospectDemos).set({ status: "active", publishedAt: new Date() }).where(eq(prospectDemos.id, demo.demoId));
      await asApp(tx, () => switchWorkspace({ db: asDb(tx) }, { userId: operatorUserId, businessId: demo.businessId }));

      const claimed = await asApp(tx, () => claimProspectDemo({ db: asDb(tx) }, { userId: claimantUserId, token: demo.token }));

      expect(claimed).toEqual({ businessId: demo.businessId, status: "claimed" });
      expect(await membership(tx, demo.businessId, claimantUserId)).toMatchObject({ status: "active", role: "business_owner" });
      expect(await membership(tx, demo.businessId, operatorUserId)).toBeUndefined();
      expect(await activeBusinessId(tx, claimantUserId)).toBe(demo.businessId);
      expect(await activeBusinessId(tx, operatorUserId)).toBeNull();
      expect(await demoRow(tx, demo.demoId)).toMatchObject({ status: "claimed", claimedByUserId: claimantUserId });
      expect(await switcherBusinessIds(tx, operatorUserId)).toEqual([ownBusinessId]);
      expect(await switcherBusinessIds(tx, claimantUserId)).toEqual([demo.businessId]);

      expect(await asApp(tx, () => claimProspectDemo({ db: asDb(tx) }, { userId: claimantUserId, token: demo.token }))).toEqual({ businessId: demo.businessId, status: "already_claimed" });
      expect(await membership(tx, demo.businessId, claimantUserId)).toMatchObject({ status: "active" });
    });
  });

  it("detaches only from closed demos on the business bound to the transaction", async () => {
    await rollbackTest(async (tx) => {
      const { operatorUserId } = await operatorWithWorkspace(tx);
      const live = await createDemo(tx, operatorUserId);
      const revoked = await createDemo(tx, operatorUserId);
      await tx.update(prospectDemos).set({ status: "revoked" }).where(eq(prospectDemos.id, revoked.demoId));

      const detach = async (boundBusinessId: string, targetBusinessId: string) => await asApp(tx, async () => {
        await tx.execute(sql`select set_config('app.user_id', ${operatorUserId}, true), set_config('app.business_id', ${boundBusinessId}, true), set_config('app.actor_type', 'operator', true)`);
        const result = await tx.execute<{ detached: number }>(sql`select app.detach_prospect_demo_operator(${targetBusinessId}::uuid) as detached`);
        return Number(result.rows[0]?.detached);
      });

      expect(await detach(live.businessId, live.businessId)).toBe(0);
      expect(await membership(tx, live.businessId, operatorUserId)).toMatchObject({ status: "active" });
      expect(await detach(live.businessId, revoked.businessId)).toBe(0);
      expect(await membership(tx, revoked.businessId, operatorUserId)).toMatchObject({ status: "active" });
      expect(await detach(revoked.businessId, revoked.businessId)).toBe(1);
      expect(await membership(tx, revoked.businessId, operatorUserId)).toMatchObject({ status: "removed" });
    });
  });

  it("repairs demos closed before the fix and changes nothing on a second run", async () => {
    await rollbackTest(async (tx) => {
      const { operatorUserId, ownBusinessId } = await operatorWithWorkspace(tx);
      const claimantUserId = await insertUser(tx);
      const revoked = await createDemo(tx, operatorUserId);
      const pastExpiry = await createDemo(tx, operatorUserId);
      const live = await createDemo(tx, operatorUserId);
      const claimed = await createDemo(tx, operatorUserId);

      // Reproduce the state the old revoke and expiry paths left behind.
      await tx.update(prospectDemos).set({ status: "revoked", expiresAt: new Date(Date.now() - 60_000) }).where(eq(prospectDemos.id, revoked.demoId));
      await tx.update(prospectDemos).set({ status: "active", expiresAt: new Date(Date.now() - 60_000) }).where(eq(prospectDemos.id, pastExpiry.demoId));
      await tx.update(prospectDemos).set({ status: "claimed", claimedAt: new Date(), claimedByUserId: claimantUserId }).where(eq(prospectDemos.id, claimed.demoId));
      await tx.delete(businessMemberships).where(and(eq(businessMemberships.businessId, claimed.businessId), eq(businessMemberships.userId, operatorUserId)));
      await tx.insert(businessMemberships).values({ businessId: claimed.businessId, userId: claimantUserId, role: "business_owner", status: "active" });
      await tx.update(users).set({ activeBusinessId: revoked.businessId }).where(eq(users.id, operatorUserId));
      await tx.update(users).set({ activeBusinessId: claimed.businessId }).where(eq(users.id, claimantUserId));
      const demosBefore = await tx.select().from(prospectDemos).where(eq(prospectDemos.operatorUserId, operatorUserId));
      const businessIds = [ownBusinessId, revoked.businessId, pastExpiry.businessId, live.businessId, claimed.businessId];
      const businessRows = async () => await tx.select().from(businesses).where(inArray(businesses.id, businessIds)).orderBy(businesses.id);
      const businessesBefore = await businessRows();

      const repair = await readFile(cleanupMigration, "utf8");
      await tx.execute(sql.raw(repair));

      expect(await membership(tx, revoked.businessId, operatorUserId)).toMatchObject({ status: "removed" });
      expect(await membership(tx, pastExpiry.businessId, operatorUserId)).toMatchObject({ status: "removed" });
      expect(await membership(tx, live.businessId, operatorUserId)).toMatchObject({ status: "active" });
      expect(await membership(tx, ownBusinessId, operatorUserId)).toMatchObject({ status: "active" });
      expect(await membership(tx, claimed.businessId, claimantUserId)).toMatchObject({ status: "active" });
      expect(await activeBusinessId(tx, operatorUserId)).toBeNull();
      expect(await activeBusinessId(tx, claimantUserId)).toBe(claimed.businessId);
      expect(new Set(await switcherBusinessIds(tx, operatorUserId))).toEqual(new Set([ownBusinessId, live.businessId]));

      // now() is fixed for the whole test transaction, so compare row versions:
      // any UPDATE, even one that writes the same values, gives a row a new ctid.
      const rowVersions = async () => (await tx.execute<{ ctid: string }>(sql`
        select ctid::text from public.business_memberships where user_id in (${operatorUserId}::uuid, ${claimantUserId}::uuid)
        union all
        select ctid::text from public.users where id in (${operatorUserId}::uuid, ${claimantUserId}::uuid)
        order by 1
      `)).rows.map((row) => row.ctid);
      const afterFirst = await rowVersions();
      await tx.execute(sql.raw(repair));
      expect(await rowVersions()).toEqual(afterFirst);

      expect(await tx.select().from(prospectDemos).where(eq(prospectDemos.operatorUserId, operatorUserId))).toEqual(demosBefore);
      expect(await businessRows()).toEqual(businessesBefore);
    });
  });

  it("clears an operator's active workspace on a demo someone claimed before the fix", async () => {
    await rollbackTest(async (tx) => {
      const { operatorUserId, ownBusinessId } = await operatorWithWorkspace(tx);
      const claimantUserId = await insertUser(tx);
      const claimed = await createDemo(tx, operatorUserId);

      // The old claim path removed the operator's membership but kept its active business.
      await tx.update(prospectDemos).set({ status: "claimed", claimedAt: new Date(), claimedByUserId: claimantUserId }).where(eq(prospectDemos.id, claimed.demoId));
      await tx.delete(businessMemberships).where(and(eq(businessMemberships.businessId, claimed.businessId), eq(businessMemberships.userId, operatorUserId)));
      await tx.insert(businessMemberships).values({ businessId: claimed.businessId, userId: claimantUserId, role: "business_owner", status: "active" });
      await tx.update(users).set({ activeBusinessId: claimed.businessId }).where(inArray(users.id, [operatorUserId, claimantUserId]));

      const repair = await readFile(cleanupMigration, "utf8");
      await tx.execute(sql.raw(repair));

      expect(await activeBusinessId(tx, operatorUserId)).toBeNull();
      expect(await activeBusinessId(tx, claimantUserId)).toBe(claimed.businessId);
      expect(await membership(tx, claimed.businessId, claimantUserId)).toMatchObject({ status: "active" });
      expect(await membership(tx, ownBusinessId, operatorUserId)).toMatchObject({ status: "active" });
    });
  });
});
