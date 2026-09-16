import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { accounts, businesses, businessMemberships, calls, createDatabaseClient, dashboardAggregatesQuery, users, withBusinessTransaction, type DashboardAggregates } from "@lobbystack/db";
import { hashReplacementPassword } from "../apps/admin/src/lib/password";

// Run against a local/test database with the role-specific environment loaded.
const auth = createDatabaseClient("lobbystack_auth");
const worker = createDatabaseClient("lobbystack_worker");
const app = createDatabaseClient("lobbystack_app");
const userId = randomUUID();
const tenants = [randomUUID(), randomUUID()];
const currentStart = new Date("2026-08-12T00:00:00Z");
const previousStart = new Date("2026-07-13T00:00:00Z");
const chartStart = new Date("2025-10-01T00:00:00Z");
const baseUrl = process.env.DASHBOARD_CHECK_BASE_URL;
const password = `Audit-${randomUUID()}!`;
const email = `${userId}@dashboard.invalid`;

try {
  await auth.db.insert(users).values({ id: userId, email, normalizedEmail: email, emailVerified: true, activeBusinessId: tenants[0] });
  if (baseUrl) await auth.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: await hashReplacementPassword(password) });
  for (const businessId of tenants) {
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `dashboard-${businessId}`, name: "Dashboard test", timezone: "UTC", businessType: "service_company", onboardingStage: "complete" });
      await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
      await tx.insert(calls).values([
        { businessId, providerCallId: randomUUID(), transport: "pstn", startedAt: currentStart, providerDurationSeconds: 10 },
        { businessId, providerCallId: randomUUID(), transport: "pstn", startedAt: new Date("2026-08-31T23:59:59Z"), endedAt: new Date("2026-09-01T00:00:00.500Z") },
        { businessId, providerCallId: randomUUID(), transport: "pstn", startedAt: new Date("2026-09-01T00:00:00Z") },
        { businessId, providerCallId: randomUUID(), transport: "pstn", startedAt: previousStart, providerDurationSeconds: 7 },
        { businessId, providerCallId: randomUUID(), transport: "pstn", startedAt: new Date("2026-07-12T23:59:59Z"), providerDurationSeconds: 999 },
      ]);
    });
  }
  await withBusinessTransaction(app.db, { businessId: tenants[0]!, userId, actorType: "operator" }, async tx => {
    const read = async (businessId: string) => (await tx.execute(dashboardAggregatesQuery({ businessId, currentStart, previousStart, chartStart }))).rows[0] as DashboardAggregates;
    const own = await read(tenants[0]!);
    assert.equal(own.callsCurrent, 3);
    assert.equal(own.callsPrevious, 1);
    assert.equal(own.averageDurationCurrent, 4); // (10 + rounded 1.5 + open call 0) / 3
    assert.equal(own.averageDurationPrevious, 7);
    assert.equal(own.messagesCurrent, 0);
    assert.equal(own.appointmentsCurrent, 0);
    assert.deepEqual(own.monthlyCalls, [{ month: "2026-07-01", total: 2 }, { month: "2026-08-01", total: 2 }, { month: "2026-09-01", total: 1 }]);
    const foreign = await read(tenants[1]!);
    assert.equal(foreign.callsCurrent, 0);
    assert.equal(foreign.averageDurationCurrent, 0);
    assert.deepEqual(foreign.monthlyCalls, []);
  });
  console.log("Dashboard PostgreSQL aggregates: period boundaries, duration rounding, UTC buckets, empty values and tenant isolation passed.");
  if (baseUrl) {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname), "HTTP validation must target a local app");
    const origin = process.env.APP_BASE_URL ?? baseUrl;
    const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password }) });
    assert.equal(signIn.status, 200, "Fixture sign-in failed");
    const cookie = signIn.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    try {
      for (const path of ["/api/dashboard", "/api/preferences/locale", "/analytics", "/contacts", "/settings/appearance"]) {
        const response: Response = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
        assert.equal(response.status, 200, `${path} failed`);
        const body = await response.text();
        if (path === "/api/dashboard") {
          const result = JSON.parse(body);
          assert.equal(result.businessId, tenants[0]);
          assert.equal(result.monthlyCalls.length, 12);
        }
      }
      console.log("Authenticated local sign-in, dashboard API, locale preference and dashboard page requests passed.");
    } finally {
      await fetch(`${baseUrl}/api/auth/sign-out`, { method: "POST", headers: { cookie, origin } });
    }
  }
} finally {
  for (const businessId of tenants) await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, tx => tx.delete(businesses).where(eq(businesses.id, businessId)));
  await auth.db.delete(users).where(eq(users.id, userId));
  await Promise.all([auth.pool.end(), worker.pool.end(), app.pool.end()]);
}
