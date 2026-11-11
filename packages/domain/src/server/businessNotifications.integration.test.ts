import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businessMemberships, businesses, businessNotifications, createDatabaseClient, outboxMessages, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import type { AuthzRole } from "@lobbystack/contracts";
import type { ProductUpdateEntry } from "@lobbystack/shared";

import { listBusinessNotifications, markBusinessNotificationsRead, postBusinessNotificationInTransaction, postProductUpdates, resolveBusinessNotificationsInTransaction, type NotificationReader } from "./businessNotifications";
import { capabilityNames, type Capability } from "./businessAccess";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Notification integration tests require a dedicated local test database.");
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

async function user(tx: DatabaseTransaction): Promise<string> {
  const id = randomUUID();
  await tx.insert(users).values({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid`, name: "Sam" });
  return id;
}

async function business(tx: DatabaseTransaction, team: Array<{ userId: string; role: AuthzRole }>, values: Partial<typeof businesses.$inferInsert> = {}): Promise<string> {
  const id = randomUUID();
  await tx.insert(businesses).values({ id, slug: id, name: "Bell test", timezone: "UTC", businessType: "test", telemetryEnabled: false, ...values });
  for (const member of team) await tx.insert(businessMemberships).values({ businessId: id, userId: member.userId, role: member.role, status: "active" });
  return id;
}

/** Runs as a runtime role, so row-level security applies. */
async function as<T>(tx: DatabaseTransaction, role: "lobbystack_worker" | "lobbystack_app", run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql.raw(`set local session authorization ${role}`));
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

const reader = (role: AuthzRole, capabilities: readonly Capability[] = capabilityNames): NotificationReader => ({ role, can: (capability) => capabilities.includes(capability) });
const owner = reader("business_owner");

const post = (tx: DatabaseTransaction, input: Parameters<typeof postBusinessNotificationInTransaction>[1]) => as(tx, "lobbystack_worker", (db) => withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, (inner) => postBusinessNotificationInTransaction(inner, input)));
const resolve = (tx: DatabaseTransaction, input: Parameters<typeof resolveBusinessNotificationsInTransaction>[1]) => as(tx, "lobbystack_worker", (db) => withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, (inner) => resolveBusinessNotificationsInTransaction(inner, input)));
const list = (tx: DatabaseTransaction, userId: string, businessId: string, who: NotificationReader = owner, now?: Date) => as(tx, "lobbystack_app", (db) => listBusinessNotifications({ db }, { userId, businessId, reader: who, ...(now ? { now } : {}) }));
const markRead = (tx: DatabaseTransaction, userId: string, businessId: string, input: { ids?: string[]; all?: boolean }, now?: Date) => as(tx, "lobbystack_app", (db) => markBusinessNotificationsRead({ db }, { userId, businessId, reader: owner, ...input, ...(now ? { now } : {}) }));

/** The PostgreSQL error a statement failed with, or null when it ran. Runs in a savepoint so the test's transaction stays usable. */
async function refused(tx: DatabaseTransaction, role: "lobbystack_app", context: { userId: string; businessId: string; actorType: string }, statement: ReturnType<typeof sql>): Promise<string | null> {
  try {
    await tx.transaction(async (inner) => {
      await inner.execute(sql.raw(`set local session authorization ${role}`));
      await inner.execute(sql`select set_config('app.user_id', ${context.userId}, true), set_config('app.business_id', ${context.businessId}, true), set_config('app.actor_type', ${context.actorType}, true)`);
      await inner.execute(statement);
    });
    return null;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code ?? "error";
  }
}

const at = (iso: string) => new Date(iso);

describe.skipIf(!testUrl)("bell notifications against PostgreSQL roles", () => {
  it("post a condition once while it's open, and again as unread once it was resolved", async () => {
    await rollbackTest(async (tx) => {
      const sam = await user(tx);
      const businessId = await business(tx, [{ userId: sam, role: "business_owner" }]);
      const input = { businessId, kind: "calendar_sync_failing" as const, key: "calendar_sync:one", params: { provider: "google" }, now: at("2026-11-10T10:00:00Z") };
      const id = await post(tx, input);
      expect(id).toBeTruthy();
      expect(await post(tx, { ...input, now: at("2026-11-10T10:15:00Z") })).toBeNull();
      await markRead(tx, sam, businessId, { ids: [id!] }, at("2026-11-10T11:00:00Z"));
      expect((await list(tx, sam, businessId)).map((item) => [item.id, item.read])).toEqual([[id, true]]);

      await resolve(tx, { businessId, keys: ["calendar_sync:one"], now: at("2026-11-10T12:00:00Z") });
      expect(await list(tx, sam, businessId)).toEqual([]);
      // The sync fails again: the same row comes back, unread, with the new time.
      expect(await post(tx, { ...input, now: at("2026-11-10T13:00:00Z") })).toBe(id);
      const [again] = await list(tx, sam, businessId);
      expect(again).toMatchObject({ id, read: false, occurredAt: "2026-11-10T13:00:00.000Z", category: "action", href: "/business/integrations" });
      const realtime = await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.aggregateType, "business_notification")));
      expect(realtime.map((row) => row.topic)).toEqual(["realtime.publish", "realtime.publish"]);
    });
  });

  it("keep an action item listed after it's read until it's resolved or expires, and list action items first", async () => {
    await rollbackTest(async (tx) => {
      const sam = await user(tx);
      const businessId = await business(tx, [{ userId: sam, role: "business_owner" }]);
      const update = await post(tx, { businessId, kind: "website_import_finished", key: "website_import_finished:job", params: { site: "example.com", pages: 48 }, now: at("2026-11-10T12:00:00Z") });
      const failed = await post(tx, { businessId, kind: "payment_failed", key: "payment_failed", now: at("2026-11-01T12:00:00Z") });
      const minutes = await post(tx, { businessId, kind: "minutes_80", key: "minutes_80:2026-11", expiresAt: at("2026-12-01T00:00:00Z"), now: at("2026-11-05T12:00:00Z") });
      await markRead(tx, sam, businessId, { all: true });
      const now = at("2026-11-20T00:00:00Z");
      expect((await list(tx, sam, businessId, owner, now)).map((item) => [item.id, item.category, item.read])).toEqual([[minutes, "action", true], [failed, "action", true], [update, "update", true]]);
      // A month later the minutes alert has expired.
      expect((await list(tx, sam, businessId, owner, at("2026-12-02T00:00:00Z"))).map((item) => item.id)).toEqual([failed, update]);
      await resolve(tx, { businessId, kinds: ["payment_failed"] });
      expect((await list(tx, sam, businessId, owner, now)).map((item) => item.id)).toEqual([minutes, update]);
    });
  });

  it("keep read state per person, and mark all as read only for the person who clicked it", async () => {
    await rollbackTest(async (tx) => {
      const sam = await user(tx);
      const alex = await user(tx);
      const businessId = await business(tx, [{ userId: sam, role: "business_owner" }, { userId: alex, role: "business_admin" }]);
      const one = await post(tx, { businessId, kind: "webhook_failing", key: "webhook_failing:a", params: { host: "hooks.example.com" } });
      const two = await post(tx, { businessId, kind: "website_import_failed", key: "website_import_failed:b", params: { site: "example.com" } });
      expect(await markRead(tx, sam, businessId, { all: true })).toBe(2);
      expect((await list(tx, sam, businessId)).every((item) => item.read)).toBe(true);
      expect((await list(tx, alex, businessId)).every((item) => !item.read)).toBe(true);
      await markRead(tx, alex, businessId, { ids: [one!] });
      expect(Object.fromEntries((await list(tx, alex, businessId)).map((item) => [item.id, item.read]))).toEqual({ [one!]: true, [two!]: false });
    });
  });

  it("show each person only the kinds their role and the business let them open, and items addressed to them", async () => {
    await rollbackTest(async (tx) => {
      const sam = await user(tx);
      const viewer = await user(tx);
      const businessId = await business(tx, [{ userId: sam, role: "business_owner" }, { userId: viewer, role: "viewer" }]);
      await post(tx, { businessId, kind: "payment_failed", key: "payment_failed" });
      await post(tx, { businessId, kind: "invite_accepted", key: "invite_accepted:x", recipientUserId: sam, params: { email: "alex@example.com" } });
      await post(tx, { businessId, kind: "product_update", key: "product_update:agents", params: { copy: { en: { title: "T", description: "D", href: "https://lobbystack.com/changelog/" } } } });
      expect((await list(tx, sam, businessId)).map((item) => item.kind).sort()).toEqual(["invite_accepted", "payment_failed", "product_update"]);
      expect((await list(tx, viewer, businessId, reader("viewer"))).map((item) => item.kind)).toEqual(["product_update"]);
      // A partner's business gives no billing, so its owner never sees the host's billing items.
      expect((await list(tx, sam, businessId, reader("business_owner", ["activity", "setup", "team"]))).map((item) => item.kind).sort()).toEqual(["invite_accepted", "product_update"]);
      // Marking an item you can't see changes nothing.
      const [billing] = await tx.select({ id: businessNotifications.id }).from(businessNotifications).where(and(eq(businessNotifications.businessId, businessId), eq(businessNotifications.kind, "payment_failed")));
      expect(await as(tx, "lobbystack_app", (db) => markBusinessNotificationsRead({ db }, { userId: viewer, businessId, reader: reader("viewer"), ids: [billing!.id] }))).toBe(0);
    });
  });

  it("let the app role read only its own business's rows, and write reads only for the signed-in person", async () => {
    await rollbackTest(async (tx) => {
      const sam = await user(tx);
      const stranger = await user(tx);
      const businessId = await business(tx, [{ userId: sam, role: "business_owner" }]);
      const other = await business(tx, [{ userId: stranger, role: "business_owner" }]);
      const id = await post(tx, { businessId, kind: "payment_failed", key: "payment_failed" });
      // Someone outside the team, in the business's context, sees nothing.
      expect(await list(tx, stranger, businessId)).toEqual([]);
      expect(await list(tx, stranger, other)).toEqual([]);
      expect(await refused(tx, "lobbystack_app", { userId: stranger, businessId, actorType: "operator" }, sql`insert into public.business_notification_reads (notification_id, user_id, business_id) values (${id}, ${stranger}, ${businessId})`)).toBe("42501");
      // A teammate can't write a read for someone else.
      expect(await refused(tx, "lobbystack_app", { userId: sam, businessId, actorType: "operator" }, sql`insert into public.business_notification_reads (notification_id, user_id, business_id) values (${id}, ${stranger}, ${businessId})`)).toBe("42501");
      expect(await refused(tx, "lobbystack_app", { userId: sam, businessId, actorType: "operator" }, sql`insert into public.business_notification_reads (notification_id, user_id, business_id) values (${id}, ${sam}, ${businessId})`)).toBeNull();
      // The app role can't delete a notification.
      expect(await refused(tx, "lobbystack_app", { userId: sam, businessId, actorType: "operator" }, sql`delete from public.business_notifications where id = ${id}`)).toBe("42501");
      // A person reads only their own reads.
      const rows = await as(tx, "lobbystack_app", (db) => withBusinessTransaction(db, { userId: stranger, businessId, actorType: "operator" }, (inner) => inner.execute(sql`select count(*)::int as count from public.business_notification_reads`)));
      expect((rows.rows[0] as { count: number }).count).toBe(0);
    });
  });

  it("drop a refused write without undoing the producer's transaction", async () => {
    await rollbackTest(async (tx) => {
      const sam = await user(tx);
      const businessId = await business(tx, [{ userId: sam, role: "business_owner" }]);
      const kept = await as(tx, "lobbystack_app", (db) => withBusinessTransaction(db, { userId: randomUUID(), businessId, actorType: "operator" }, async (inner) => {
        const id = await postBusinessNotificationInTransaction(inner, { businessId, kind: "payment_failed", key: "payment_failed" });
        const after = await inner.execute(sql`select 1 as one`);
        return { id, after: after.rows.length };
      }));
      expect(kept).toEqual({ id: null, after: 1 });
    });
  });

  it("post each released changelog entry once per business, from the day it was created", async () => {
    await rollbackTest(async (tx) => {
      const sam = await user(tx);
      const businessId = await business(tx, [{ userId: sam, role: "business_owner" }], { createdAt: at("2026-11-01T15:00:00Z") });
      const selfHosted = await business(tx, [{ userId: sam, role: "business_owner" }], { createdAt: at("2026-11-01T15:00:00Z"), deploymentMode: "self_hosted_standard" });
      const entry = (slug: string, pubDate: string): ProductUpdateEntry => ({ slug, pubDate, dashboardHref: "/agents", copy: { en: { title: slug, description: "Line", href: `https://lobbystack.com/changelog/#${slug}` } } });
      const entries = [entry("before-signup", "2026-10-20T00:00:00.000Z"), entry("same-day", "2026-11-01T00:00:00.000Z"), entry("released", "2026-11-05T00:00:00.000Z"), entry("tomorrow", "2026-11-11T00:00:00.000Z")];
      const run = (id: string, now: string) => as(tx, "lobbystack_worker", (db) => postProductUpdates({ db }, { businessId: id, entries, now: at(now) }));
      expect(await run(businessId, "2026-11-10T12:00:00Z")).toEqual(["same-day", "released"]);
      expect(await run(businessId, "2026-11-10T13:00:00Z")).toEqual([]);
      expect(await run(businessId, "2026-11-11T01:00:00Z")).toEqual(["tomorrow"]);
      expect(await run(selfHosted, "2026-11-11T01:00:00Z")).toEqual([]);
      const items = await list(tx, sam, businessId, owner, at("2026-11-11T02:00:00Z"));
      // Newest first; the two posted on the same run share a time.
      expect(items.map((item) => [item.kind, item.href, (item.params as { slug: string }).slug])[0]).toEqual(["product_update", "/agents", "tomorrow"]);
      expect(items.map((item) => (item.params as { slug: string }).slug).slice(1).sort()).toEqual(["released", "same-day"]);
      // 90 days on, an entry leaves the panel and isn't posted again.
      expect(await run(businessId, "2027-03-01T00:00:00Z")).toEqual([]);
      expect(await list(tx, sam, businessId, owner, at("2027-03-01T00:00:00Z"))).toEqual([]);
    });
  });
});
