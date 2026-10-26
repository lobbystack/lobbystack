import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";
import { initializeTelemetry, shutdownTelemetry } from "@lobbystack/telemetry/node";

import { createDatabaseClient, databaseHealthCheck } from "./client";
import {
  concurrentIndexName,
  MIGRATION_JOURNAL_TABLE,
  LEGACY_BASELINE_MIGRATIONS,
  ROLE_MIGRATION,
  SCHEMA_MIGRATIONS,
} from "./migrations/raw-migrations";
import { businesses, schema } from "./schema";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
if (process.env.LOBBYSTACK_SKIP_ENV_FILES !== "true") {
  loadEnv({ path: [resolve(repositoryRoot, ".env.local"), resolve(repositoryRoot, ".env")], quiet: true });
}

async function main(): Promise<void> {
  await initializeTelemetry({ serviceName: "lobbystack-migrator" });
  const command = process.argv[2] ?? "check";
  const migrator = createDatabaseClient("lobbystack_migrator");
  let migrationLockClient: PoolClient | undefined;

  try {
    switch (command) {
      case "migrate": {
        // Keep this session checked out for the whole migration run. Concurrent
        // index builds are visible as invalid until their final phase, so a
        // second migrator must not mistake an active build for a failed one.
        migrationLockClient = await migrator.pool.connect();
        // Data repairs report what they changed with RAISE NOTICE.
        migrationLockClient.on("notice", (notice) => { if (notice.message) console.log(notice.message); });
        await migrationLockClient.query("select pg_advisory_lock(hashtext('lobbystack:migrations'))");
        const lockedMigrator = { ...migrator, db: drizzle(migrationLockClient, { schema }) };
        const applied = await prepareMigrationJournal(lockedMigrator);
        if (applied.size === 0 && (await appSchemaExists(lockedMigrator))) {
          // The database was provisioned before this journal existed and already
          // has the full schema. Record the known history as applied instead of
          // replaying DDL against live tables.
          await baselineExistingMigrations(lockedMigrator, applied);
          console.log(`Baselined ${LEGACY_BASELINE_MIGRATIONS.length} previously-applied migrations into ${MIGRATION_JOURNAL_TABLE}.`);
        }
        await applyRawMigration(lockedMigrator, ROLE_MIGRATION, applied);
        await migrate(lockedMigrator.db, { migrationsFolder: "./migrations/generated" });
        for (const fileName of SCHEMA_MIGRATIONS) {
          await applyRawMigration(lockedMigrator, fileName, applied);
        }
        console.log("Database migrations applied.");
        break;
      }
      case "bootstrap": {
        const rolePasswords: Array<[string, string | undefined]> = [
          ["lobbystack_migrator", process.env.LOBBYSTACK_MIGRATOR_PASSWORD],
          ["lobbystack_auth", process.env.LOBBYSTACK_AUTH_PASSWORD],
          ["lobbystack_app", process.env.LOBBYSTACK_APP_PASSWORD],
          ["lobbystack_worker", process.env.LOBBYSTACK_WORKER_PASSWORD],
          ["lobbystack_dispatcher", process.env.LOBBYSTACK_DISPATCHER_PASSWORD],
          ["lobbystack_readonly", process.env.LOBBYSTACK_READONLY_PASSWORD],
          ["lobbystack_finance_export", process.env.LOBBYSTACK_FINANCE_EXPORT_PASSWORD],
        ];
        const existingRoles = new Set(
          (await migrator.db.execute<{ rolname: string }>(sql`select rolname from pg_roles where rolname like 'lobbystack_%'`)).rows.map((row) => row.rolname),
        );
        let updated = 0;
        for (const [role, password] of rolePasswords) {
          if (!password || !existingRoles.has(role)) continue;
          // ALTER ROLE is a utility statement: it cannot take a bind parameter for
          // the password. Role names come from the fixed allowlist above and the
          // password is escaped as a single-quoted literal.
          await migrator.db.execute(sql.raw(`alter role "${role.replaceAll('"', '""')}" with login password '${password.replaceAll("'", "''")}'`));
          updated += 1;
        }
        console.log(`Database role logins configured for ${updated} roles.`);
        break;
      }
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
          where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('__drizzle_migrations', '__lobbystack_migrations')
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
            and c.relname not in ('__drizzle_migrations', '__lobbystack_migrations')
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
            ,('lobbystack_app', 'deployment_branding', 'SELECT')
            ,('lobbystack_worker', 'deployment_branding', 'SELECT')
            ,('lobbystack_readonly', 'deployment_branding', 'SELECT')
            ,('lobbystack_worker', 'platform_key_businesses', 'SELECT')
            ,('lobbystack_worker', 'platform_key_businesses', 'INSERT')
            ,('lobbystack_worker', 'platform_key_businesses', 'DELETE')
            ,('lobbystack_app', 'platform_key_businesses', 'SELECT')
            ,('lobbystack_app', 'partners', 'SELECT')
            ,('lobbystack_app', 'partners', 'INSERT')
            ,('lobbystack_app', 'partner_members', 'SELECT')
            ,('lobbystack_app', 'partner_members', 'INSERT')
            ,('lobbystack_app', 'partner_invitations', 'SELECT')
            ,('lobbystack_app', 'partner_invitations', 'INSERT')
            ,('lobbystack_app', 'partner_domains', 'SELECT')
            ,('lobbystack_app', 'partner_domains', 'INSERT')
            ,('lobbystack_app', 'partner_domains', 'DELETE')
            ,('lobbystack_worker', 'partner_domains', 'SELECT')
            ,('lobbystack_app', 'partner_signup_invitations', 'SELECT')
            ,('lobbystack_app', 'partner_signup_invitations', 'INSERT')
            ,('lobbystack_readonly', 'partners', 'SELECT')
            ,('lobbystack_readonly', 'partner_members', 'SELECT')
            ,('lobbystack_app', 'partner_platform_keys', 'SELECT')
            ,('lobbystack_app', 'partner_platform_keys', 'INSERT')
            ,('lobbystack_readonly', 'partner_platform_keys', 'SELECT')
            ,('lobbystack_app', 'user_active_businesses', 'SELECT')
            ,('lobbystack_app', 'user_active_businesses', 'INSERT')
            ,('lobbystack_app', 'user_active_businesses', 'DELETE')
            ,('lobbystack_readonly', 'user_active_businesses', 'SELECT')
            ,('lobbystack_app', 'partner_business_opens', 'SELECT')
            ,('lobbystack_app', 'partner_business_opens', 'INSERT')
            ,('lobbystack_readonly', 'partner_business_opens', 'SELECT')
            ,('lobbystack_app', 'partner_stripe_accounts', 'SELECT')
            ,('lobbystack_app', 'partner_stripe_accounts', 'INSERT')
            ,('lobbystack_app', 'partner_packages', 'SELECT')
            ,('lobbystack_app', 'partner_packages', 'INSERT')
            ,('lobbystack_readonly', 'partner_stripe_accounts', 'SELECT')
            ,('lobbystack_readonly', 'partner_packages', 'SELECT')
            ,('lobbystack_worker', 'partner_packages', 'SELECT')
            ,('lobbystack_app', 'partner_billing_accounts', 'SELECT')
            ,('lobbystack_worker', 'partner_billing_accounts', 'SELECT')
            ,('lobbystack_worker', 'partner_billing_accounts', 'INSERT')
            ,('lobbystack_worker', 'partner_billing_accounts', 'UPDATE')
            ,('lobbystack_readonly', 'partner_billing_accounts', 'SELECT')
            ,('lobbystack_app', 'partner_checkout_requests', 'SELECT')
            ,('lobbystack_app', 'partner_checkout_requests', 'INSERT')
            ,('lobbystack_worker', 'partner_checkout_requests', 'SELECT')
            ,('lobbystack_readonly', 'partner_checkout_requests', 'SELECT')
            ,('lobbystack_worker', 'partner_number_charges', 'SELECT')
            ,('lobbystack_worker', 'partner_number_charges', 'INSERT')
            ,('lobbystack_readonly', 'partner_number_charges', 'SELECT')
            ,('lobbystack_app', 'partner_lifecycles', 'SELECT')
            ,('lobbystack_worker', 'partner_lifecycles', 'SELECT')
            ,('lobbystack_worker', 'partner_lifecycles', 'INSERT')
            ,('lobbystack_readonly', 'partner_lifecycles', 'SELECT')
            ,('lobbystack_app', 'partner_lifecycle_events', 'SELECT')
            ,('lobbystack_worker', 'partner_lifecycle_events', 'SELECT')
            ,('lobbystack_worker', 'partner_lifecycle_events', 'INSERT')
            ,('lobbystack_readonly', 'partner_lifecycle_events', 'SELECT')
            ,('lobbystack_worker', 'partner_stripe_accounts', 'SELECT')
            ,('lobbystack_worker', 'partner_tier_billing', 'SELECT')
            ,('lobbystack_worker', 'partner_tier_billing', 'INSERT')
            ,('lobbystack_worker', 'partner_tier_billing', 'UPDATE')
            ,('lobbystack_readonly', 'partner_tier_billing', 'SELECT')
            ,('lobbystack_readonly', 'partner_usage_months', 'SELECT')
            ,('lobbystack_worker', 'provider_events', 'SELECT')
            ,('lobbystack_worker', 'provider_events', 'UPDATE')
            ,('lobbystack_app', 'business_templates', 'SELECT')
            ,('lobbystack_app', 'business_templates', 'INSERT')
            ,('lobbystack_app', 'business_templates', 'DELETE')
            ,('lobbystack_app', 'business_template_files', 'SELECT')
            ,('lobbystack_app', 'business_template_files', 'INSERT')
            ,('lobbystack_app', 'business_template_files', 'DELETE')
            ,('lobbystack_readonly', 'business_templates', 'SELECT')
            ,('lobbystack_readonly', 'business_template_files', 'SELECT')
            ,('lobbystack_finance_export', 'businesses', 'SELECT')
            ,('lobbystack_finance_export', 'billing_accounts', 'SELECT')
            ,('lobbystack_finance_export', 'calls', 'SELECT')
            ,('lobbystack_finance_export', 'appointments', 'SELECT')
            ,('lobbystack_finance_export', 'unit_economics_events', 'SELECT')
            ,('lobbystack_finance_export', 'billing_transactions', 'SELECT')
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
        // The app role updates partner rows only through the columns partner
        // operations write, so no row moves to another partner, person, sender or
        // role, and no partner changes its slug. A partner's platform key can only
        // be revoked. A person's active business on a partner's domains moves only
        // to another of that partner's businesses, and opening a partner's business
        // again only moves the open's times. A package's price, allowance and Stripe
        // objects never change once made, and a saved template never changes.
        const partnerUpdateGrantFailures = await migrator.db.execute<{ table_name: string; column_name: string; granted: boolean }>(sql`
          select expected.table_name, expected.column_name, expected.granted
          from (values
            ('partner_members', 'role', true),
            ('partner_members', 'status', true),
            ('partner_members', 'updated_at', true),
            ('partner_members', 'partner_id', false),
            ('partner_members', 'user_id', false),
            ('partner_invitations', 'status', true),
            ('partner_invitations', 'accepted_by_user_id', true),
            ('partner_invitations', 'accepted_at', true),
            ('partner_invitations', 'updated_at', true),
            ('partner_invitations', 'partner_id', false),
            ('partner_invitations', 'invited_by_user_id', false),
            ('partner_invitations', 'role', false),
            ('partner_invitations', 'token_hash', false),
            ('partner_invitations', 'normalized_email', false),
            ('partner_invitations', 'expires_at', false),
            ('partner_signup_invitations', 'status', true),
            ('partner_signup_invitations', 'accepted_by_user_id', true),
            ('partner_signup_invitations', 'partner_id', true),
            ('partner_signup_invitations', 'accepted_at', true),
            ('partner_signup_invitations', 'updated_at', true),
            ('partner_signup_invitations', 'token_hash', false),
            ('partner_signup_invitations', 'normalized_email', false),
            ('partner_signup_invitations', 'expires_at', false),
            ('partners', 'name', true),
            ('partners', 'logo', true),
            ('partners', 'logo_content_type', true),
            ('partners', 'favicon', true),
            ('partners', 'favicon_content_type', true),
            ('partners', 'brand_color', true),
            ('partners', 'terms_url', true),
            ('partners', 'privacy_url', true),
            ('partners', 'support_url', true),
            ('partners', 'support_email', true),
            ('partners', 'telemetry_enabled', true),
            ('partners', 'updated_at', true),
            ('partners', 'slug', false),
            ('partners', 'status', false),
            ('partners', 'created_by_user_id', false),
            ('partner_domains', 'hostname', true),
            ('partner_domains', 'verified_at', true),
            ('partner_domains', 'updated_at', true),
            ('partner_domains', 'partner_id', false),
            ('partner_domains', 'kind', false),
            ('partner_domains', 'provider', false),
            ('partner_domains', 'provider_hostname_id', false),
            ('partner_domains', 'dns_records', false),
            ('partner_domains', 'failed_at', false),
            ('partner_domains', 'verification_token', false),
            ('partner_platform_keys', 'revoked_at', true),
            ('partner_platform_keys', 'revoked_by_user_id', true),
            ('partner_platform_keys', 'updated_at', true),
            ('partner_platform_keys', 'partner_id', false),
            ('partner_platform_keys', 'name', false),
            ('partner_platform_keys', 'prefix', false),
            ('partner_platform_keys', 'key_hash', false),
            ('partner_platform_keys', 'access', false),
            ('partner_platform_keys', 'scopes', false),
            ('partner_platform_keys', 'created_by_user_id', false),
            ('partner_platform_keys', 'last_used_at', false),
            ('user_active_businesses', 'business_id', true),
            ('user_active_businesses', 'updated_at', true),
            ('user_active_businesses', 'user_id', false),
            ('user_active_businesses', 'partner_id', false),
            ('partner_business_opens', 'opened_at', true),
            ('partner_business_opens', 'expires_at', true),
            ('partner_business_opens', 'business_id', false),
            ('partner_business_opens', 'user_id', false),
            ('partner_business_opens', 'partner_id', false),
            ('partner_stripe_accounts', 'stripe_account_id', true),
            ('partner_stripe_accounts', 'country', true),
            ('partner_stripe_accounts', 'currency', true),
            ('partner_stripe_accounts', 'details_submitted', true),
            ('partner_stripe_accounts', 'charges_enabled', true),
            ('partner_stripe_accounts', 'payouts_enabled', true),
            ('partner_stripe_accounts', 'disabled_reason', true),
            ('partner_stripe_accounts', 'disconnected_at', true),
            ('partner_stripe_accounts', 'synced_at', true),
            ('partner_stripe_accounts', 'connected_by_user_id', true),
            ('partner_stripe_accounts', 'updated_at', true),
            ('partner_stripe_accounts', 'partner_id', false),
            ('partner_packages', 'name', true),
            ('partner_packages', 'archived_at', true),
            ('partner_packages', 'updated_at', true),
            ('partner_packages', 'partner_id', false),
            ('partner_packages', 'currency', false),
            ('partner_packages', 'monthly_price_minor', false),
            ('partner_packages', 'setup_fee_minor', false),
            ('partner_packages', 'voice_minutes', false),
            ('partner_packages', 'chats', false),
            ('partner_packages', 'stripe_account_id', false),
            ('partner_packages', 'stripe_product_id', false),
            ('partner_packages', 'stripe_price_id', false),
            ('partner_packages', 'stripe_setup_price_id', false),
            ('partner_checkout_requests', 'status', true),
            ('partner_checkout_requests', 'updated_at', true),
            ('partner_checkout_requests', 'partner_id', false),
            ('partner_checkout_requests', 'requested_by_user_id', false),
            ('partner_checkout_requests', 'tier', false),
            ('partner_checkout_requests', 'return_origin', false),
            ('partner_checkout_requests', 'checkout_url', false),
            ('partner_billing_accounts', 'tier', false),
            ('partner_billing_accounts', 'subscription_state', false),
            ('partner_billing_accounts', 'pool_voice_seconds', false),
            ('partner_billing_accounts', 'included_numbers', false),
            ('partner_billing_accounts', 'pool_overage_enabled', false),
            ('partner_billing_accounts', 'pool_overage_cap_cents', false),
            ('partner_billing_accounts', 'host_pool_voice_seconds', false),
            ('partner_billing_accounts', 'host_pool_chats', false),
            ('business_templates', 'partner_id', false),
            ('business_templates', 'manifest', false),
            ('business_template_files', 'partner_id', false),
            ('business_template_files', 'object_key', false),
            ('partner_lifecycles', 'state', false),
            ('partner_lifecycles', 'since', false),
            ('partner_lifecycles', 'tier_ended_at', false)
          ) as expected(table_name, column_name, granted)
          where has_column_privilege('lobbystack_app', 'public.' || expected.table_name, expected.column_name, 'UPDATE') <> expected.granted
        `);
        if (partnerUpdateGrantFailures.rows.length > 0) {
          throw new Error(`Partner update grant verification failed for: ${partnerUpdateGrantFailures.rows.map((row) => `${row.table_name}.${row.column_name}:${row.granted ? "missing" : "unexpected"}`).join(", ")}`);
        }
        // The worker fills in a partner's checkout with Polar's page, and never
        // moves it to another partner, person, tier or return address.
        const partnerCheckoutWorkerGrantFailures = await migrator.db.execute<{ column_name: string; granted: boolean }>(sql`
          select expected.column_name, expected.granted
          from (values
            ('status', true),
            ('checkout_id', true),
            ('checkout_url', true),
            ('error', true),
            ('updated_at', true),
            ('partner_id', false),
            ('requested_by_user_id', false),
            ('tier', false),
            ('billing_interval', false),
            ('return_origin', false)
          ) as expected(column_name, granted)
          where has_column_privilege('lobbystack_worker', 'public.partner_checkout_requests', expected.column_name, 'UPDATE') <> expected.granted
        `);
        if (partnerCheckoutWorkerGrantFailures.rows.length > 0) {
          throw new Error(`Partner checkout worker grant verification failed for: ${partnerCheckoutWorkerGrantFailures.rows.map((row) => `${row.column_name}:${row.granted ? "missing" : "unexpected"}`).join(", ")}`);
        }
        // The worker records what the provider says of a partner's own domain,
        // and never moves it to another partner, hostname, kind or provider,
        // or changes the token the partner proves it controls the domain with.
        const partnerDomainWorkerGrantFailures = await migrator.db.execute<{ column_name: string; granted: boolean }>(sql`
          select expected.column_name, expected.granted
          from (values
            ('provider_hostname_id', true),
            ('dns_records', true),
            ('provider_errors', true),
            ('checked_at', true),
            ('verified_at', true),
            ('failed_at', true),
            ('updated_at', true),
            ('partner_id', false),
            ('hostname', false),
            ('kind', false),
            ('provider', false),
            ('verification_token', false)
          ) as expected(column_name, granted)
          where has_column_privilege('lobbystack_worker', 'public.partner_domains', expected.column_name, 'UPDATE') <> expected.granted
        `);
        if (partnerDomainWorkerGrantFailures.rows.length > 0) {
          throw new Error(`Partner domain worker grant verification failed for: ${partnerDomainWorkerGrantFailures.rows.map((row) => `${row.column_name}:${row.granted ? "missing" : "unexpected"}`).join(", ")}`);
        }
        // The worker settles a partner number's months, and never moves the
        // number to another partner or business or changes what it costs. The
        // app never writes a number's cost at all.
        const partnerNumberChargeGrantFailures = await migrator.db.execute<{ role_name: string; column_name: string; granted: boolean }>(sql`
          select expected.role_name, expected.column_name, expected.granted
          from (values
            ('lobbystack_worker', 'months_settled', true),
            ('lobbystack_worker', 'months_charged', true),
            ('lobbystack_worker', 'updated_at', true),
            ('lobbystack_worker', 'partner_id', false),
            ('lobbystack_worker', 'business_id', false),
            ('lobbystack_worker', 'phone_number_id', false),
            ('lobbystack_worker', 'monthly_cost_cents', false),
            ('lobbystack_worker', 'started_at', false),
            ('lobbystack_app', 'months_settled', false),
            ('lobbystack_app', 'monthly_cost_cents', false)
          ) as expected(role_name, column_name, granted)
          where has_column_privilege(expected.role_name, 'public.partner_number_charges', expected.column_name, 'UPDATE') <> expected.granted
        `);
        if (partnerNumberChargeGrantFailures.rows.length > 0) {
          throw new Error(`Partner number charge grant verification failed for: ${partnerNumberChargeGrantFailures.rows.map((row) => `${row.role_name}:${row.column_name}:${row.granted ? "missing" : "unexpected"}`).join(", ")}`);
        }
        // The worker moves a partner through its lifecycle, and never moves the
        // row to another partner.
        const partnerLifecycleWorkerGrantFailures = await migrator.db.execute<{ column_name: string; granted: boolean }>(sql`
          select expected.column_name, expected.granted
          from (values
            ('state', true),
            ('since', true),
            ('tier_ended_at', true),
            ('updated_at', true),
            ('partner_id', false),
            ('created_at', false)
          ) as expected(column_name, granted)
          where has_column_privilege('lobbystack_worker', 'public.partner_lifecycles', expected.column_name, 'UPDATE') <> expected.granted
        `);
        if (partnerLifecycleWorkerGrantFailures.rows.length > 0) {
          throw new Error(`Partner lifecycle worker grant verification failed for: ${partnerLifecycleWorkerGrantFailures.rows.map((row) => `${row.column_name}:${row.granted ? "missing" : "unexpected"}`).join(", ")}`);
        }
        // A partner's lifecycle record outlives its businesses, so nobody rewrites or removes it.
        const partnerLifecycleEventGrantFailures = await migrator.db.execute<{ role_name: string; privilege_type: string }>(sql`
          select expected.role_name, expected.privilege_type
          from (values
            ('lobbystack_app', 'INSERT'),
            ('lobbystack_app', 'UPDATE'),
            ('lobbystack_app', 'DELETE'),
            ('lobbystack_worker', 'UPDATE'),
            ('lobbystack_worker', 'DELETE')
          ) as expected(role_name, privilege_type)
          where has_table_privilege(expected.role_name, 'public.partner_lifecycle_events', expected.privilege_type)
        `);
        if (partnerLifecycleEventGrantFailures.rows.length > 0) {
          throw new Error(`Partner lifecycle event grant verification failed for unexpected: ${partnerLifecycleEventGrantFailures.rows.map((row) => `${row.role_name}:${row.privilege_type}`).join(", ")}`);
        }
        // A partner's pool counts move only through its functions: the worker
        // reserves and records usage inside one of the partner's businesses,
        // and an owner's overage settings go through their own function. No
        // runtime role reads or writes the counts directly.
        const partnerPoolGrantFailures = await migrator.db.execute<{ role_name: string; object_name: string; granted: boolean }>(sql`
          select expected.role_name, expected.object_name, expected.granted
          from (values
            ('lobbystack_worker', 'app.lock_partner_pool(uuid, text)', true),
            ('lobbystack_worker', 'app.record_partner_pool_usage(uuid, text, double precision, double precision, double precision, double precision, double precision, double precision)', true),
            ('lobbystack_worker', 'app.partner_pool_month(uuid, text)', true),
            ('lobbystack_app', 'app.partner_pool_month(uuid, text)', true),
            ('lobbystack_app', 'app.set_partner_pool_overage(uuid, boolean, integer)', true),
            ('lobbystack_app', 'app.lock_partner_pool(uuid, text)', false),
            ('lobbystack_app', 'app.record_partner_pool_usage(uuid, text, double precision, double precision, double precision, double precision, double precision, double precision)', false),
            ('lobbystack_worker', 'app.set_partner_pool_overage(uuid, boolean, integer)', false),
            -- The host sets a partner's pool from its own tooling, as the system actor on the app role; the worker never does.
            ('lobbystack_app', 'app.set_partner_host_pool(uuid, integer, integer)', true),
            ('lobbystack_worker', 'app.set_partner_host_pool(uuid, integer, integer)', false),
            ('lobbystack_app', 'app.can_use_partner_pool(uuid, text)', false),
            ('lobbystack_worker', 'app.can_use_partner_pool(uuid, text)', false),
            ('lobbystack_worker', 'app.claim_partner_pool_alerts(uuid, text, text[])', true),
            ('lobbystack_worker', 'app.partner_pool_alert_recipients(uuid, text)', true),
            ('lobbystack_worker', 'app.count_partner_open_calls(uuid, text, timestamptz, uuid)', true),
            ('lobbystack_app', 'app.claim_partner_pool_alerts(uuid, text, text[])', false),
            ('lobbystack_app', 'app.partner_pool_alert_recipients(uuid, text)', false),
            ('lobbystack_app', 'app.count_partner_open_calls(uuid, text, timestamptz, uuid)', false),
            -- A business's allowance alerts: only the worker, metering usage inside the business, reads who gets them.
            ('lobbystack_worker', 'app.business_allowance_alert_recipients(uuid)', true),
            ('lobbystack_app', 'app.business_allowance_alert_recipients(uuid)', false),
            -- A partner's trial number: only the worker finds the business that holds it, to convert it when the partner pays.
            ('lobbystack_worker', 'app.partner_number_trial_business(uuid)', true),
            ('lobbystack_app', 'app.partner_number_trial_business(uuid)', false),
            ('lobbystack_app', 'app.partner_number_trial_used(uuid)', false),
            ('lobbystack_worker', 'app.partner_number_trial_used(uuid)', false)
          ) as expected(role_name, object_name, granted)
          where has_function_privilege(expected.role_name, expected.object_name, 'EXECUTE') <> expected.granted
          union all
          select expected.role_name, 'public.partner_usage_months:' || expected.privilege_type, false
          from (values ('lobbystack_app', 'SELECT'), ('lobbystack_app', 'INSERT'), ('lobbystack_app', 'UPDATE'), ('lobbystack_worker', 'SELECT'), ('lobbystack_worker', 'INSERT'), ('lobbystack_worker', 'UPDATE')) as expected(role_name, privilege_type)
          where has_table_privilege(expected.role_name, 'public.partner_usage_months', expected.privilege_type)
        `);
        if (partnerPoolGrantFailures.rows.length > 0) {
          throw new Error(`Partner pool grant verification failed for: ${partnerPoolGrantFailures.rows.map((row) => `${row.role_name}:${row.object_name}:${row.granted ? "missing" : "unexpected"}`).join(", ")}`);
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
            ('lobbystack_worker', 'app.expire_prospect_demos()'),
            ('lobbystack_app', 'app.detach_prospect_demo_operator(uuid)'),
            ('lobbystack_worker', 'app.resolve_onboarding_followup_recipient(uuid, timestamptz)'),
            ('lobbystack_worker', 'app.list_businesses_by_contact_phone(text)')
          ) as expected(role_name, function_name)
          where not has_function_privilege(expected.role_name, expected.function_name, 'EXECUTE')
        `);
        if (demoResolverGrantFailures.rows.length > 0) {
          throw new Error(`Demo resolver grant verification failed for: ${demoResolverGrantFailures.rows.map((row) => `${row.role_name}:${row.function_name}`).join(", ")}`);
        }
        const widgetResolverGrantFailures = await migrator.db.execute<{ role_name: string; function_name: string }>(sql`
          select role_name, function_name
          from (values
            ('lobbystack_app', 'app.resolve_business_by_widget_key(text)'),
            ('lobbystack_worker', 'app.resolve_business_by_widget_key(text)'),
            ('lobbystack_app', 'app.resolve_api_key(text)'),
            ('lobbystack_worker', 'app.resolve_api_key(text)'),
            ('lobbystack_worker', 'app.resolve_platform_key_owner(text)'),
            ('lobbystack_worker', 'app.list_platform_key_businesses(text, timestamptz, uuid, integer)'),
            ('lobbystack_worker', 'app.reserve_api_number_claim(uuid, uuid, text, uuid, text, jsonb, text, text, text, boolean)'),
            ('lobbystack_worker', 'app.resolve_api_verified_phone(uuid, uuid)'),
            ('lobbystack_worker', 'app.resolve_oauth_access_token(text)'),
            ('lobbystack_worker', 'app.touch_oauth_grant(text)'),
            ('lobbystack_app', 'app.list_oauth_grantors(uuid)'),
            ('lobbystack_app', 'app.list_business_members(uuid)'),
            ('lobbystack_app', 'app.count_owned_direct_businesses(uuid)'),
            ('lobbystack_app', 'app.list_user_businesses(uuid)'),
            ('lobbystack_app', 'app.list_partner_businesses(uuid)'),
            ('lobbystack_app', 'app.list_partner_business_usage(uuid, text)'),
            ('lobbystack_app', 'app.is_partner_member_email(uuid, text)'),
            ('lobbystack_app', 'app.business_number_claim_in_progress(uuid)'),
            ('lobbystack_worker', 'app.business_number_claim_in_progress(uuid)'),
            ('lobbystack_worker', 'app.business_exists(uuid)'),
            ('lobbystack_app', 'app.list_partner_business_billing(uuid)'),
            ('lobbystack_app', 'app.partner_role(uuid)'),
            ('lobbystack_worker', 'app.partner_role(uuid)'),
            ('lobbystack_readonly', 'app.partner_role(uuid)'),
            ('lobbystack_app', 'app.list_partner_members(uuid)'),
            ('lobbystack_app', 'app.partner_brand(uuid)'),
            ('lobbystack_worker', 'app.partner_brand(uuid)'),
            ('lobbystack_app', 'app.partner_brand_image(uuid, text)'),
            ('lobbystack_app', 'app.partner_for_host(text)'),
            ('lobbystack_app', 'app.business_partner(uuid)'),
            ('lobbystack_app', 'app.partner_access_role(uuid)'),
            ('lobbystack_worker', 'app.partner_access_role(uuid)'),
            ('lobbystack_dispatcher', 'app.partner_access_role(uuid)'),
            ('lobbystack_app', 'app.has_partner_access(uuid)'),
            ('lobbystack_worker', 'app.has_partner_access(uuid)'),
            ('lobbystack_app', 'app.has_team_membership(uuid)'),
            ('lobbystack_worker', 'app.business_partner(uuid)'),
            ('lobbystack_app', 'app.partner_number_standing(uuid)'),
            ('lobbystack_worker', 'app.partner_number_standing(uuid)'),
            ('lobbystack_worker', 'app.due_partner_number_charges(timestamptz, integer, uuid[])'),
            ('lobbystack_app', 'app.partner_business_answers(uuid)'),
            ('lobbystack_worker', 'app.partner_business_answers(uuid)'),
            ('lobbystack_worker', 'app.audit_partner_lifecycle_step(uuid, varchar, varchar, timestamptz, varchar)'),
            ('lobbystack_worker', 'app.partner_businesses_due_for_deletion(integer, uuid[])'),
            ('lobbystack_app', 'app.can_save_initial_branding()'),
            ('lobbystack_app', 'app.save_initial_branding(text, bytea, text)'),
            ('lobbystack_app', 'app.finish_business_handover(uuid, uuid)'),
            ('lobbystack_worker', 'app.disable_removed_platform_key_webhooks(uuid[])'),
            ('lobbystack_worker', 'app.resolve_partner_platform_key(text)'),
            ('lobbystack_worker', 'app.touch_partner_platform_key(uuid)'),
            ('lobbystack_worker', 'app.lock_active_partner_platform_key(uuid)'),
            ('lobbystack_app', 'app.lock_active_partner_platform_key(uuid)'),
            ('lobbystack_app', 'app.disable_revoked_partner_platform_key_webhooks(uuid)'),
            ('lobbystack_app', 'app.revoke_partner_platform_key_invitations(uuid)'),
            ('lobbystack_worker', 'app.list_open_live_call_businesses(timestamptz, timestamptz)'),
            ('lobbystack_dispatcher', 'app.list_scheduler_businesses()'),
            ('lobbystack_dispatcher', 'app.list_summary_backfill_businesses()'),
            ('lobbystack_dispatcher', 'app.list_reembed_businesses(text)')
          ) as expected(role_name, function_name)
          where not has_function_privilege(expected.role_name, expected.function_name, 'EXECUTE')
        `);
        if (widgetResolverGrantFailures.rows.length > 0) {
          throw new Error(`Widget resolver grant verification failed for: ${widgetResolverGrantFailures.rows.map((row) => `${row.role_name}:${row.function_name}`).join(", ")}`);
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
    if (migrationLockClient) {
      await migrationLockClient.query("select pg_advisory_unlock(hashtext('lobbystack:migrations'))").catch(() => undefined);
      migrationLockClient.removeAllListeners("notice");
      migrationLockClient.release();
    }
    await migrator.pool.end().catch(() => undefined);
    await shutdownTelemetry();
  }
}

async function ensureMigrationJournal(client: ReturnType<typeof createDatabaseClient>): Promise<void> {
  await client.db.execute(sql`
    create table if not exists public.__lobbystack_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function readAppliedMigrations(client: ReturnType<typeof createDatabaseClient>): Promise<Map<string, string>> {
  const result = await client.db.execute<{ name: string; checksum: string }>(sql`
    select name, checksum from public.__lobbystack_migrations
  `);
  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

async function appSchemaExists(client: ReturnType<typeof createDatabaseClient>): Promise<boolean> {
  const result = await client.db.execute<{ present: boolean }>(sql`
    select to_regnamespace('app') is not null as present
  `);
  return result.rows[0]?.present ?? false;
}

async function prepareMigrationJournal(client: ReturnType<typeof createDatabaseClient>): Promise<Map<string, string>> {
  await ensureMigrationJournal(client);
  return readAppliedMigrations(client);
}

async function baselineExistingMigrations(
  client: ReturnType<typeof createDatabaseClient>,
  applied: Map<string, string>,
): Promise<void> {
  for (const fileName of LEGACY_BASELINE_MIGRATIONS) {
    const contents = await readFile(resolve("migrations", fileName), "utf8");
    const checksum = createHash("sha256").update(contents).digest("hex");
    await client.db.execute(sql`
      insert into public.__lobbystack_migrations (name, checksum)
      values (${fileName}, ${checksum})
      on conflict (name) do nothing
    `);
    applied.set(fileName, checksum);
  }
}

async function applyRawMigration(
  client: ReturnType<typeof createDatabaseClient>,
  fileName: string,
  applied: Map<string, string>,
): Promise<void> {
  const contents = await readFile(resolve("migrations", fileName), "utf8");
  const checksum = createHash("sha256").update(contents).digest("hex");
  const recorded = applied.get(fileName);
  const indexName = concurrentIndexName(contents);
  if (recorded !== undefined) {
    if (recorded !== checksum) {
      console.warn(`Migration ${fileName} was already applied with a different checksum; leaving the applied version in place.`);
      return;
    }
    if (!indexName || (await readConcurrentIndexValidity(client, indexName)) === true) {
      console.log(`Skipping already-applied migration ${fileName}.`);
      return;
    }
    console.warn(`Repairing missing or invalid concurrent index ${indexName} for migration ${fileName}.`);
  }
  if (indexName) {
    // CREATE INDEX CONCURRENTLY is intentionally outside a transaction so it
    // does not block writes for the duration of a production index build. A
    // failed concurrent build can leave an invalid index behind; remove only
    // that invalid artifact before retrying the idempotent migration.
    if ((await readConcurrentIndexValidity(client, indexName)) === false) {
      await client.db.execute(sql.raw(`drop index concurrently if exists public."${indexName}"`));
    }
    await client.db.execute(sql.raw(contents));
    if ((await readConcurrentIndexValidity(client, indexName)) !== true) {
      throw new Error(`Concurrent index migration ${fileName} did not create a valid ${indexName} index.`);
    }
    await client.db.execute(sql`
      insert into public.__lobbystack_migrations (name, checksum)
      values (${fileName}, ${checksum})
      on conflict (name) do update set checksum = excluded.checksum, applied_at = now()
    `);
    applied.set(fileName, checksum);
    console.log(`Applied migration ${fileName}.`);
    return;
  }
  // Apply the file and record it in one transaction so a failure never marks a
  // migration as done. Postgres treats a multi-statement simple query as a
  // single implicit transaction, so this preserves the previous atomicity while
  // making it explicit for the journal write.
  await client.db.transaction(async (tx) => {
    await tx.execute(sql.raw(contents));
    await tx.execute(sql`
      insert into public.__lobbystack_migrations (name, checksum)
      values (${fileName}, ${checksum})
      on conflict (name) do update set checksum = excluded.checksum, applied_at = now()
    `);
  });
  applied.set(fileName, checksum);
  console.log(`Applied migration ${fileName}.`);
}

async function readConcurrentIndexValidity(
  client: ReturnType<typeof createDatabaseClient>,
  indexName: string,
): Promise<boolean | undefined> {
  const result = await client.db.execute<{ valid: boolean }>(sql`
    select i.indisvalid as valid
    from pg_catalog.pg_index i
    where i.indexrelid = to_regclass(${`public.${indexName}`})
  `);
  return result.rows[0]?.valid;
}

async function verifyRlsBehavior(client: ReturnType<typeof createDatabaseClient>): Promise<void> {
  await client.db.transaction(async (tx) => {
    const ids = (await tx.execute<{
      business_a: string;
      business_b: string;
      business_c: string;
      user_id: string;
    }>(sql`select gen_random_uuid() as business_a, gen_random_uuid() as business_b, gen_random_uuid() as business_c, gen_random_uuid() as user_id`)).rows[0];
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
      insert into public.partners (id, name, slug)
      values
        (${ids.business_a}::uuid, 'RLS Partner A', ${`rls-a-${ids.business_a.slice(0, 8)}`}),
        (${ids.business_b}::uuid, 'RLS Partner B', ${`rls-b-${ids.business_b.slice(0, 8)}`})
    `);
    await tx.execute(sql`
      insert into public.partner_members (partner_id, user_id, role)
      values (${ids.business_a}::uuid, ${ids.user_id}::uuid, 'member')
    `);
    // A business of partner A, whose team the user is on without being on the business's.
    await tx.execute(sql`
      insert into public.businesses (id, slug, name, timezone, business_type, partner_id)
      values (${ids.business_c}::uuid, ${`rls-c-${ids.business_c}`}, 'RLS Verification C', 'UTC', 'test', ${ids.business_a}::uuid)
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

      const partners = (await tx.execute<{ id: string }>(sql`select id::text from public.partners where id in (${ids.business_a}::uuid, ${ids.business_b}::uuid)`)).rows.map((row) => row.id);
      if (partners.length !== 1 || partners[0] !== ids.business_a) {
        throw new Error(`RLS partner isolation check failed (visible=${partners.length}).`);
      }
      // A partner's members see its brand, but only owners and admins change it.
      const memberBrandUpdates = (await tx.execute(sql`update public.partners set brand_color = '#000000' where id = ${ids.business_a}::uuid returning id`)).rows.length;
      if (memberBrandUpdates !== 0) {
        throw new Error(`RLS partner brand check failed (a member changed ${memberBrandUpdates} partner).`);
      }
      // The same goes for the partner's telemetry setting.
      const memberTelemetryUpdates = (await tx.execute(sql`update public.partners set telemetry_enabled = false where id = ${ids.business_a}::uuid returning id`)).rows.length;
      if (memberTelemetryUpdates !== 0) {
        throw new Error(`RLS partner telemetry check failed (a member changed ${memberTelemetryUpdates} partner).`);
      }

      await tx.execute(sql`select set_config('app.business_id', ${ids.business_b}, true)`);
      const unauthorizedBusiness = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.businesses`)).rows[0]?.count;
      if (unauthorizedBusiness !== "0") {
        throw new Error(`RLS cross-tenant check failed (unauthorized business count=${unauthorizedBusiness}).`);
      }

      // A partner member reaches a partner's business only while they hold an open of it.
      await tx.execute(sql`select set_config('app.business_id', ${ids.business_c}, true)`);
      const unopenedBusiness = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.businesses`)).rows[0]?.count;
      await tx.execute(sql.raw("reset role"));
      await tx.execute(sql`
        insert into public.partner_business_opens (business_id, user_id, partner_id, expires_at)
        values (${ids.business_c}::uuid, ${ids.user_id}::uuid, ${ids.business_a}::uuid, now() + interval '1 hour')
      `);
      await tx.execute(sql.raw("set local role lobbystack_app"));
      const openedBusiness = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.businesses`)).rows[0]?.count;
      if (unopenedBusiness !== "0" || openedBusiness !== "1") {
        throw new Error(`RLS partner open check failed (before open=${unopenedBusiness ?? "missing"}, after=${openedBusiness ?? "missing"}).`);
      }
      // Releasing the business forgets the partner's opens of it, so the member reaches nothing in it again.
      await tx.execute(sql.raw("reset role"));
      await tx.execute(sql`update public.businesses set partner_id = null where id = ${ids.business_c}::uuid`);
      const keptOpens = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.partner_business_opens where business_id = ${ids.business_c}::uuid`)).rows[0]?.count;
      await tx.execute(sql.raw("set local role lobbystack_app"));
      const releasedBusiness = (await tx.execute<{ count: string }>(sql`select count(*)::text as count from public.businesses`)).rows[0]?.count;
      if (keptOpens !== "0" || releasedBusiness !== "0") {
        throw new Error(`RLS partner release check failed (opens kept=${keptOpens ?? "missing"}, visible after release=${releasedBusiness ?? "missing"}).`);
      }
      await tx.execute(sql`select set_config('app.business_id', ${ids.business_b}, true)`);

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
      await tx.execute(sql`delete from public.businesses where id in (${ids.business_a}::uuid, ${ids.business_b}::uuid, ${ids.business_c}::uuid)`);
      await tx.execute(sql`delete from public.partners where id in (${ids.business_a}::uuid, ${ids.business_b}::uuid)`);
      await tx.execute(sql`delete from public.users where id = ${ids.user_id}::uuid`);
    }
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
