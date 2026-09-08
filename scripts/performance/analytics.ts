import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { eq, sql } from "drizzle-orm";
import { businesses, businessMemberships, createDatabaseClient, users, withBusinessTransaction } from "@lobbystack/db";
import { getAnalytics } from "@lobbystack/domain";
import { summarize, type Sample } from "./metrics";
import { analyticsResponseQuery } from "../../packages/domain/src/server/analytics";
import { benchmarkMetadata } from "./metadata";

// Run with node --env-file=.env --import tsx and the repository tsconfig.
// Fixtures never enqueue work or invoke providers. Cleanup deletes only generated UUIDs.
for (const role of ["APP", "WORKER", "AUTH", "MIGRATOR"]) {
  const value = process.env[`LOBBYSTACK_${role}_DATABASE_URL`];
  if (!value || !["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname)) {
    throw new Error("Analytics fixtures require explicit role URLs to a local test database.");
  }
}
const baseline = process.env.PERFORMANCE_BASELINE_MODULE
  ? (await import(pathToFileURL(process.env.PERFORMANCE_BASELINE_MODULE).href)).getAnalytics as typeof getAnalytics
  : undefined;
const auth = createDatabaseClient("lobbystack_auth");
const worker = createDatabaseClient("lobbystack_worker");
const app = createDatabaseClient("lobbystack_app");
const migrator = createDatabaseClient("lobbystack_migrator");
app.pool.on("connect", client => { void client.query("set statement_timeout = '60s'"); });
const userId = randomUUID();
const results: unknown[] = [];
const metadata = await benchmarkMetadata("local");
const sizes = [1_000, 10_000, 100_000];
try {
  await auth.db.insert(users).values({ id: userId, email: `${userId}@performance.invalid`, normalizedEmail: `${userId}@performance.invalid` });
  for (const size of sizes) {
    const businessId = randomUUID();
    try {
      await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
        await tx.insert(businesses).values({ id: businessId, slug: `perf-${businessId}`, name: "Performance fixture", timezone: "UTC", businessType: "service_company" });
        await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
        await tx.execute(sql`insert into conversations (id, business_id, channel)
          select md5(${businessId} || '-' || n)::uuid, ${businessId}::uuid, 'web_chat'
          from generate_series(0, ${Math.ceil(size / 100) - 1}::integer) n`);
        await tx.execute(sql`insert into messages (business_id, conversation_id, channel, direction, body, ai_generated, created_at)
          select ${businessId}::uuid, md5(${businessId} || '-' || ((n - 1) / 100))::uuid, 'web_chat',
            case when n % 4 in (0, 1) then 'inbound' else 'outbound' end,
            'Synthetic performance fixture', n % 4 = 3,
            timestamptz '2026-08-01T00:00:00Z' + (n - 1) * interval '45 days' / ${size}
          from generate_series(1, ${size}::integer) n`);
        await tx.execute(sql`insert into calls (business_id, provider_call_id, transport, started_at, status, provider_duration_seconds)
          select ${businessId}::uuid, ${businessId} || '-' || n, 'webrtc',
            timestamptz '2026-08-01T00:00:00Z' + (n - 1) * interval '45 days' / ${size}, 'completed', n % 300
          from generate_series(1, ${size}::integer) n`);
      });
      // Bulk fixture insertion must not race autovacuum statistics collection.
      // Only fixture preparation uses the owner role; all timed reads use app/RLS.
      await migrator.pool.query("analyze calls, conversations, messages, appointments, business_memberships");
      const input = { businessId, userId, previousFrom: new Date("2026-08-01T00:00:00Z"), from: new Date("2026-08-15T00:00:00Z"), to: new Date("2026-09-15T00:00:00Z"), granularity: "day" as const };
      const plans = await withBusinessTransaction(app.db, { businessId, userId, actorType: "operator" }, async tx => ({
        responses: (await tx.execute(sql`explain (analyze, buffers, format json) ${analyticsResponseQuery(input)}`)).rows,
        calls: (await tx.execute(sql`explain (analyze, buffers, format json) select count(*) from calls where business_id = ${businessId}::uuid and started_at >= ${input.from.toISOString()}::timestamptz and started_at < ${input.to.toISOString()}::timestamptz`)).rows,
      }));
      results.push({ scenario: "analytics-query-plans", fixtureSize: size, plans });
      const expected = await getAnalytics({ db: app.db }, input);
      if (baseline) {
        const before = await baseline({ db: app.db }, input), after = await getAnalytics({ db: app.db }, input);
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Analytics equivalence failed at ${size} rows.`);
      }
      // Interleave before/after runs to avoid attributing warm-cache effects to the change.
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [label, run] of [...(baseline ? [["before", baseline] as const] : []), ["after", getAnalytics] as const]) {
          await run({ db: app.db }, input);
          const samples: Sample[] = [];
          const start = performance.now();
          for (let n = 0; n < 10; n++) {
            const started = performance.now();
            const response = await run({ db: app.db }, input);
            if (JSON.stringify(response) !== JSON.stringify(expected)) throw new Error("Fixture changed during measurement; discard this run.");
            samples.push({ durationMs: performance.now() - started, bytes: Buffer.byteLength(JSON.stringify(response)), ok: true, status: 200 });
          }
          const result = { scenario: "analytics", variant: label, fixtureSize: size, repeat, concurrency: 1, ...summarize(samples, performance.now() - start) };
          results.push(result);
          console.log(JSON.stringify(result));
        }
      }
    } finally {
      await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, tx => tx.delete(businesses).where(eq(businesses.id, businessId)));
    }
  }
} finally {
  await auth.db.delete(users).where(eq(users.id, userId));
  await Promise.all([auth.pool.end(), worker.pool.end(), app.pool.end(), migrator.pool.end()]);
  await writeFile(process.env.PERFORMANCE_OUTPUT ?? "/tmp/lobbystack-performance/analytics.json", JSON.stringify({ ...metadata, providerMode: "not-invoked", results }, null, 2));
}
