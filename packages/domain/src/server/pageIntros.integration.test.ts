import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { listSeenPageIntros, markPageIntroSeen } from "./pageIntros";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Page intro integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

async function insertUser(tx: DatabaseTransaction): Promise<string> {
  const id = randomUUID();
  await tx.insert(users).values({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid`, name: "Sam Owner" });
  return id;
}

/** Runs one statement as the app role, in a savepoint so a refusal leaves the test's transaction usable. */
async function asApp(tx: DatabaseTransaction, context: { userId: string; actorType: string }, statement: ReturnType<typeof sql>) {
  return await tx.transaction(async (inner) => {
    await inner.execute(sql`set local role lobbystack_app`);
    await inner.execute(sql`select set_config('app.user_id', ${context.userId}, true), set_config('app.actor_type', ${context.actorType}, true), set_config('app.business_id', '', true)`);
    return await inner.execute(statement);
  });
}

/** The PostgreSQL error a statement failed with, which Drizzle keeps as the error's cause, or null when it ran. */
async function failure(run: Promise<unknown>): Promise<{ code: string; message: string } | null> {
  try {
    await run;
    return null;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    return { code: cause?.code ?? "", message: cause?.message ?? String(error) };
  }
}

describe.skipIf(!testUrl)("page intros a person has closed", () => {
  it("stay with the person who closed them, and closing one twice keeps one row", async () => {
    await rollbackTest(async (tx) => {
      const sam = await insertUser(tx);
      const alex = await insertUser(tx);
      await tx.execute(sql`set local role lobbystack_app`);
      const context = { db: tx as unknown as Database };
      await markPageIntroSeen(context, { userId: sam, intro: "inbox" });
      await markPageIntroSeen(context, { userId: sam, intro: "inbox" });
      await markPageIntroSeen(context, { userId: sam, intro: "dashboard" });
      expect((await listSeenPageIntros(context, sam)).sort()).toEqual(["dashboard", "inbox"]);
      expect(await listSeenPageIntros(context, alex)).toEqual([]);
      await tx.execute(sql`reset role`);
      const count = await tx.execute<{ count: number }>(sql`select count(*)::int as count from public.user_page_intros where user_id = ${sam}`);
      expect(count.rows[0]?.count).toBe(2);
    });
  });

  it("let the app role read and add only the signed-in person's rows", async () => {
    await rollbackTest(async (tx) => {
      const sam = await insertUser(tx);
      const alex = await insertUser(tx);
      await tx.execute(sql`insert into public.user_page_intros (user_id, intro) values (${sam}, 'knowledge')`);

      const asAlex = await asApp(tx, { userId: alex, actorType: "operator" }, sql`select intro from public.user_page_intros`);
      expect(asAlex.rows).toEqual([]);
      const asSam = await asApp(tx, { userId: sam, actorType: "operator" }, sql`select intro from public.user_page_intros`);
      expect(asSam.rows).toEqual([{ intro: "knowledge" }]);

      // Alex can't close a card for Sam.
      expect(await failure(asApp(tx, { userId: alex, actorType: "operator" }, sql`insert into public.user_page_intros (user_id, intro) values (${sam}, 'rules')`)))
        .toEqual({ code: "42501", message: expect.stringMatching(/row-level security/) });
      // Another actor on the same user sees nothing.
      const asWorker = await asApp(tx, { userId: sam, actorType: "worker" }, sql`select intro from public.user_page_intros`);
      expect(asWorker.rows).toEqual([]);
    });
  });

  it("can't be changed or removed once closed", async () => {
    await rollbackTest(async (tx) => {
      const sam = await insertUser(tx);
      await tx.execute(sql`insert into public.user_page_intros (user_id, intro) values (${sam}, 'services')`);
      expect(await failure(asApp(tx, { userId: sam, actorType: "operator" }, sql`update public.user_page_intros set seen_at = now() where user_id = ${sam}`)))
        .toEqual({ code: "42501", message: expect.stringMatching(/permission denied/) });
      expect(await failure(asApp(tx, { userId: sam, actorType: "operator" }, sql`delete from public.user_page_intros where user_id = ${sam}`)))
        .toEqual({ code: "42501", message: expect.stringMatching(/permission denied/) });
    });
  });

  it("refuses a key that isn't a page id", async () => {
    await rollbackTest(async (tx) => {
      const sam = await insertUser(tx);
      expect((await failure(asApp(tx, { userId: sam, actorType: "operator" }, sql`insert into public.user_page_intros (user_id, intro) values (${sam}, 'Inbox; drop')`)))?.code).toBe("23514");
    });
  });
});
