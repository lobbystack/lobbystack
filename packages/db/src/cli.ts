import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { initializeTelemetry, shutdownTelemetry } from "@lobbystack/telemetry/node";

import { createDatabaseClient, databaseHealthCheck } from "./client";
import { businesses } from "./schema";

async function main(): Promise<void> {
  await initializeTelemetry({ serviceName: "lobbystack-migrator" });
  const command = process.argv[2] ?? "check";
  const migrator = createDatabaseClient("lobbystack_migrator");

  try {
    switch (command) {
      case "migrate":
        await migrator.db.execute(sql.raw(await readFile(resolve("migrations", "0000_roles.sql"), "utf8")));
        await migrate(migrator.db, { migrationsFolder: "./migrations/generated" });
        for (const fileName of ["0002_rls.sql", "0003_resolvers.sql", "0004_vector.sql", "0005_booking_concurrency.sql", "0006_auth.sql", "0007_outbox_dlq.sql", "0008_dispatcher_business_listing.sql", "0009_knowledge_url_unique.sql", "0010_provider_pricing.sql", "0011_billing_affiliate_ledger.sql", "0012_dispatcher_runtime.sql", "0013_billing_checkout.sql", "0014_worker_affiliate_user_access.sql", "0015_actor_role_enforcement.sql", "0016_conversation_session_summaries.sql", "0017_prospect_demo_isolation.sql", "0018_fractional_usage_quantity.sql", "0019_web_voice_policy.sql", "0020_prospect_demo_lifecycle.sql", "0021_prospect_demo_operator_resolvers.sql", "0022_operator_notification_preferences.sql", "0023_operator_notification_deliveries.sql", "0024_phone_onboarding.sql", "0025_phone_claims.sql", "0026_phone_replacement.sql", "0027_operator_notification_resolver.sql", "0028_message_callback_resolver.sql", "0029_sms_consent.sql", "0030_billing_usage_caps.sql", "0031_feedback_submissions.sql", "0032_unit_economics.sql", "0033_notification_provider_pricing.sql", "0034_call_billing_exclusion.sql", "0035_app_user_profile_columns.sql", "0036_replacement_import_ids.sql"]) {
          const file = await readFile(resolve("migrations", fileName), "utf8");
          await migrator.db.execute(sql.raw(file));
        }
        console.log("Database migrations applied.");
        break;
      case "check": {
        const health = await databaseHealthCheck(migrator);
        if (!health.ok) {
          throw new Error("PostgreSQL health check failed.");
        }
        console.log(JSON.stringify(health));
        break;
      }
      case "seed":
        await migrator.db.insert(businesses).values({
          slug: "demo-business",
          name: "Demo Business",
          timezone: "America/Toronto",
          defaultLocale: "en",
          businessType: "service_company",
          deploymentMode: process.env.DEPLOYMENT_MODE ?? "development",
        }).onConflictDoNothing({ target: businesses.slug });
        console.log("Deterministic seed applied.");
        break;
      case "reset-test":
        if (process.env.NODE_ENV === "production") {
          throw new Error("db:reset:test is disabled in production.");
        }
        await migrator.db.execute(sql`drop schema if exists public cascade; create schema public;`);
        console.log("Test database reset. Run db:migrate before use.");
        break;
      case "verify-rls": {
        const rows = await migrator.db.execute<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(sql`
          select c.relname, c.relrowsecurity, c.relforcerowsecurity
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('__drizzle_migrations')
          order by c.relname
        `);
        const failures = rows.rows.filter((row) => !row.relrowsecurity || !row.relforcerowsecurity);
        if (failures.length > 0) {
          throw new Error(`RLS verification failed for: ${failures.map((row) => row.relname).join(", ")}`);
        }
        const policyFailures = await migrator.db.execute<{ relname: string }>(sql`
          select c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
          where n.nspname = 'public'
            and c.relkind = 'r'
            and c.relname <> '__drizzle_migrations'
            and c.relrowsecurity
          group by c.relname
          having count(p.policyname) = 0
          order by c.relname
        `);
        if (policyFailures.rows.length > 0) {
          throw new Error(`RLS policy verification failed for: ${policyFailures.rows.map((row) => row.relname).join(", ")}`);
        }
        const grantFailures = await migrator.db.execute<{ role_name: string; table_name: string; privilege_type: string }>(sql`
          select expected.role_name, expected.table_name, expected.privilege_type
          from (values
            ('lobbystack_auth', 'users', 'SELECT'),
            ('lobbystack_auth', 'accounts', 'SELECT'),
            ('lobbystack_auth', 'sessions', 'SELECT'),
            ('lobbystack_auth', 'verifications', 'SELECT'),
            ('lobbystack_app', 'outbox_messages', 'INSERT'),
            ('lobbystack_worker', 'outbox_messages', 'INSERT'),
            ('lobbystack_dispatcher', 'outbox_messages', 'SELECT'),
            ('lobbystack_dispatcher', 'outbox_messages', 'INSERT'),
            ('lobbystack_dispatcher', 'outbox_messages', 'UPDATE'),
            ('lobbystack_dispatcher', 'outbox_messages', 'DELETE'),
            ('lobbystack_readonly', 'outbox_messages', 'SELECT'),
            ('lobbystack_app', 'prospect_demos', 'SELECT'),
            ('lobbystack_worker', 'prospect_demos', 'SELECT'),
            ('lobbystack_readonly', 'prospect_demos', 'SELECT')
          ) as expected(role_name, table_name, privilege_type)
          where not has_table_privilege(expected.role_name, 'public.' || expected.table_name, expected.privilege_type)
        `);
        if (grantFailures.rows.length > 0) {
          throw new Error(`Database grant verification failed for: ${grantFailures.rows.map((row) => `${row.role_name}:${row.table_name}:${row.privilege_type}`).join(", ")}`);
        }
        const affiliateUserGrantFailures = await migrator.db.execute<{ column_name: string }>(sql`
          select expected.column_name
          from (values ('id'), ('email'), ('name')) as expected(column_name)
          where not has_column_privilege('lobbystack_worker', 'public.users', expected.column_name, 'SELECT')
        `);
        if (affiliateUserGrantFailures.rows.length > 0) {
          throw new Error(`Affiliate worker user grant verification failed for: ${affiliateUserGrantFailures.rows.map((row) => row.column_name).join(", ")}`);
        }
        const demoResolverGrantFailures = await migrator.db.execute<{ role_name: string; function_name: string }>(sql`
          select role_name, function_name
          from (values
            ('lobbystack_app', 'app.resolve_business_by_demo_token(text)'),
            ('lobbystack_worker', 'app.resolve_business_by_demo_token(text)'),
            ('lobbystack_app', 'app.resolve_prospect_demo_by_token(text)'),
            ('lobbystack_worker', 'app.resolve_prospect_demo_by_token(text)'),
            ('lobbystack_app', 'app.resolve_operator_prospect_demo(uuid)'),
            ('lobbystack_app', 'app.list_operator_prospect_demos()'),
            ('lobbystack_worker', 'app.expire_prospect_demos()')
          ) as expected(role_name, function_name)
          where not has_function_privilege(expected.role_name, expected.function_name, 'EXECUTE')
        `);
        if (demoResolverGrantFailures.rows.length > 0) {
          throw new Error(`Demo resolver grant verification failed for: ${demoResolverGrantFailures.rows.map((row) => `${row.role_name}:${row.function_name}`).join(", ")}`);
        }
        if (process.env.VERIFY_RLS_BEHAVIOR === "true") {
          await verifyRlsBehavior(migrator);
        }
        console.log(`RLS enabled and forced on ${rows.rows.length} tables.`);
        break;
      }
      default:
        throw new Error(`Unknown database command: ${command}`);
    }
  } finally {
    await migrator.pool.end().catch(() => undefined);
    await shutdownTelemetry();
  }
}

async function verifyRlsBehavior(client: ReturnType<typeof createDatabaseClient>): Promise<void> {
  await client.db.transaction(async (tx) => {
    const ids = (await tx.execute<{
      business_a: string;
      business_b: string;
      user_id: string;
    }>(sql`select gen_random_uuid() as business_a, gen_random_uuid() as business_b, gen_random_uuid() as user_id`)).rows[0];
    if (!ids) throw new Error("Could not create RLS verification identifiers.");

    await tx.execute(sql`
      insert into public.businesses (id, slug, name, timezone, business_type)
      values
        (${ids.business_a}::uuid, ${`rls-a-${ids.business_a}`} , 'RLS Verification A', 'UTC', 'test'),
        (${ids.business_b}::uuid, ${`rls-b-${ids.business_b}`} , 'RLS Verification B', 'UTC', 'test')
    `);
    await tx.execute(sql`
      insert into public.users (id, email, normalized_email)
      values (${ids.user_id}::uuid, ${`rls-${ids.user_id}@example.invalid`}, ${`rls-${ids.user_id}@example.invalid`})
    `);
    await tx.execute(sql`
      insert into public.business_memberships (business_id, user_id, role)
      values (${ids.business_a}::uuid, ${ids.user_id}::uuid, 'business_owner')
    `);
    await tx.execute(sql`
      insert into public.services (business_id, name, slug, duration_minutes)
      values
        (${ids.business_a}::uuid, 'RLS Service A', ${`rls-service-a-${ids.business_a}`}, 30),
        (${ids.business_b}::uuid, 'RLS Service B', ${`rls-service-b-${ids.business_b}`}, 30)
    `);

    try {
      await tx.execute(sql.raw("set local role lobbystack_app"));
      await tx.execute(sql`select set_config('app.business_id', ${ids.business_a}, true)`);
      await tx.execute(sql`select set_config('app.user_id', ${ids.user_id}, true)`);
      await tx.execute(sql`select set_config('app.actor_type', 'operator', true)`);
      const ownBusiness = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.businesses`)).rows[0]?.count;
      const foreignServices = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.services where business_id = ${ids.business_b}::uuid`)).rows[0]?.count;
      if (ownBusiness !== "1" || foreignServices !== "0") {
        throw new Error(`RLS visibility check failed for app role (own=${ownBusiness ?? "missing"}, foreign=${foreignServices ?? "missing"}).`);
      }

      await tx.execute(sql`select set_config('app.business_id', ${ids.business_b}, true)`);
      const unauthorizedBusiness = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.businesses`)).rows[0]?.count;
      if (unauthorizedBusiness !== "0") {
        throw new Error(`RLS cross-tenant check failed (unauthorized business count=${unauthorizedBusiness}).`);
      }

      await tx.execute(sql`select set_config('app.actor_type', 'worker', true)`);
      const spoofedWorkerServices = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.services where business_id = ${ids.business_b}::uuid`)).rows[0]?.count;
      await tx.execute(sql`select set_config('app.actor_type', 'dispatcher', true)`);
      const spoofedDispatcherServices = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.services where business_id = ${ids.business_b}::uuid`)).rows[0]?.count;
      if (spoofedWorkerServices !== "0" || spoofedDispatcherServices !== "0") {
        throw new Error(`RLS role spoofing check failed (worker=${spoofedWorkerServices ?? "missing"}, dispatcher=${spoofedDispatcherServices ?? "missing"}).`);
      }

      await tx.execute(sql.raw("set local role lobbystack_worker"));
      await tx.execute(sql`select set_config('app.actor_type', 'worker', true)`);
      const workerBusiness = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.businesses`)).rows[0]?.count;
      if (workerBusiness !== "1") {
        throw new Error(`RLS worker-context check failed (count=${workerBusiness ?? "missing"}).`);
      }
    } finally {
      await tx.execute(sql.raw("reset role"));
      await tx.execute(sql`delete from public.businesses where id in (${ids.business_a}::uuid, ${ids.business_b}::uuid)`);
    }
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
