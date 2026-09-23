import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createDatabaseClient, type DatabaseClient } from "@lobbystack/db";

// Phase 9 query-plan validation. This harness seeds a deterministic synthetic
// dataset into an isolated local PostgreSQL/pgvector database, then runs
// EXPLAIN (ANALYZE, BUFFERS) for the production predicates behind retention
// sweeps, booking availability, and dashboard aggregates. Timed plans run under
// the real `lobbystack_app`/`lobbystack_worker` logins with the same RLS GUCs
// the runtimes set, so the planner sees the policy predicates it sees in
// production.
//
// Safety: the harness refuses to run unless ALLOW_QUERY_PLAN_CHECK=true, refuses
// any non-loopback host, and never reads `.env` files. Fixtures use only the
// reserved `qp-fixture-*` slugs and fixed UUIDs, so it never touches existing
// data and is reproducible. Migrator/owner credentials are used for fixtures
// and ANALYZE only; all measured statements use the app or worker role.
//
// Usage:
//   ALLOW_QUERY_PLAN_CHECK=true \
//   QUERY_PLAN_CHECK_DATABASE_URL=postgres://owner@127.0.0.1:55432/lobbystack \
//   QUERY_PLAN_CHECK_APP_DATABASE_URL=postgres://lobbystack_app:pw@127.0.0.1:55432/lobbystack \
//   QUERY_PLAN_CHECK_WORKER_DATABASE_URL=postgres://lobbystack_worker:pw@127.0.0.1:55432/lobbystack \
//   pnpm exec tsx --tsconfig tsconfig.base.json scripts/query-plan-check.ts --label=before --out=/tmp/qp-before.json
//
// Pass --reseed to drop and recreate the synthetic tenants.

const BUSINESS_A = "11111111-1111-4111-8111-111111111111";
const BUSINESS_B = "22222222-2222-4222-8222-222222222222";
const BUSINESS_C = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const FIXTURE_SLUG_PREFIX = "qp-fixture-";
const MEASUREMENT_REPEATS = 7;

type MeasurementRole = "app" | "worker";

type CaseDefinition = {
  id: string;
  role: MeasurementRole;
  source: string;
  sql: string;
  params: unknown[];
  // DML cases write on every EXPLAIN (ANALYZE); the rollback leaves aborted
  // tuples that index scans still traverse. Vacuum this table between
  // iterations so before/after buffer counts measure the plan, not bloat.
  table?: string;
};

type PlanShape = {
  nodeTypes: string[];
  outerScan: string;
  scanSummary: string;
  scanRows: number;
  scanBuffers: number;
  planRows: number;
  actualRows: number;
  sharedHitBlocks: number;
  sharedReadBlocks: number;
  sharedWrittenBlocks: number;
  executionMs: number;
  medianExecutionMs: number;
  planningMs: number;
};

function fixtureUuid(...parts: Array<string | number>): string {
  const hex = createHash("md5").update(["qp", ...parts.map(String)].join(":")).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function loopbackUrl(name: string): string {
  const raw = process.env[name];
  if (!raw) throw new Error(`Set ${name} to an isolated local PostgreSQL instance.`);
  if (process.env.ALLOW_QUERY_PLAN_CHECK !== "true") {
    throw new Error("Refusing to run: set ALLOW_QUERY_PLAN_CHECK=true after confirming the target is disposable.");
  }
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against NODE_ENV=production.");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error(`${name} must be a postgres:// URL.`);
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`Refusing non-loopback host "${host}" in ${name}.`);
  return raw;
}

// The SQL uses concat_ws(':', 'qp', ...) for every derived key. Mirror that here
// so the harness and the fixtures agree without a shared lookup table.
function fixtureSql(): string {
  const businesses = `(values ('${BUSINESS_A}'::uuid, 40000), ('${BUSINESS_B}'::uuid, 9000), ('${BUSINESS_C}'::uuid, 1000)) as b(id, n)`;
  const busyBusinesses = `(values ('${BUSINESS_A}'::uuid, 30000), ('${BUSINESS_B}'::uuid, 6000), ('${BUSINESS_C}'::uuid, 800)) as b(id, n)`;
  const appointmentBusinesses = `(values ('${BUSINESS_A}'::uuid, 16000), ('${BUSINESS_B}'::uuid, 4000), ('${BUSINESS_C}'::uuid, 600)) as b(id, n)`;
  return `
begin;

insert into public.businesses (id, slug, name, timezone, business_type, deployment_mode, onboarding_stage)
values
  ('${BUSINESS_A}', '${FIXTURE_SLUG_PREFIX}a', 'QP fixture A', 'UTC', 'service_company', 'development', 'complete'),
  ('${BUSINESS_B}', '${FIXTURE_SLUG_PREFIX}b', 'QP fixture B', 'UTC', 'service_company', 'development', 'complete'),
  ('${BUSINESS_C}', '${FIXTURE_SLUG_PREFIX}c', 'QP fixture C', 'UTC', 'service_company', 'development', 'complete')
on conflict (id) do nothing;

insert into public.users (id, email, normalized_email, email_verified)
values ('${USER_ID}', 'qz-fixture@example.invalid', 'qz-fixture@example.invalid', true)
on conflict (id) do nothing;

insert into public.business_memberships (business_id, user_id, role, status)
select b.id, '${USER_ID}'::uuid, 'business_owner', 'active' from (values ('${BUSINESS_A}'::uuid), ('${BUSINESS_B}'::uuid), ('${BUSINESS_C}'::uuid)) as b(id)
on conflict do nothing;

insert into public.staff (id, business_id, name, timezone, active)
select md5(concat_ws(':', 'qp', 'staff', b.id::text, s::text))::uuid, b.id, 'Staff ' || s, 'UTC', true
from (values ('${BUSINESS_A}'::uuid), ('${BUSINESS_B}'::uuid), ('${BUSINESS_C}'::uuid)) as b(id), generate_series(0, 4) s
on conflict do nothing;

insert into public.services (id, business_id, name, slug, duration_minutes)
select md5(concat_ws(':', 'qp', 'service', b.id::text))::uuid, b.id, 'Service', 'service', 30
from (values ('${BUSINESS_A}'::uuid), ('${BUSINESS_B}'::uuid), ('${BUSINESS_C}'::uuid)) as b(id)
on conflict do nothing;

insert into public.contacts (id, business_id, name, phone)
select md5(concat_ws(':', 'qp', 'contact', b.id::text, c::text))::uuid, b.id, 'Contact ' || c, '+1555' || lpad(c::text, 7, '0')
from (values ('${BUSINESS_A}'::uuid), ('${BUSINESS_B}'::uuid), ('${BUSINESS_C}'::uuid)) as b(id), generate_series(0, 299) c
on conflict do nothing;

insert into public.conversations (id, business_id, channel, status)
select md5(concat_ws(':', 'qp', 'conv', b.id::text, c::text))::uuid, b.id, 'web_chat', 'open'
from (values ('${BUSINESS_A}'::uuid), ('${BUSINESS_B}'::uuid), ('${BUSINESS_C}'::uuid)) as b(id), generate_series(0, 499) c
on conflict do nothing;

insert into public.calls (id, business_id, provider_call_id, transport, status, started_at, created_at, updated_at, recording_object_id)
select md5(concat_ws(':', 'qp', 'call', b.id::text, g.i::text))::uuid, b.id,
  'qp-call-' || b.id::text || '-' || g.i::text, 'pstn', 'completed',
  now() - ((g.i % 720) || ' days')::interval, now(), now(),
  case when g.i % 20 = 0 then md5(concat_ws(':', 'qp', 'rec', b.id::text, g.i::text))::uuid else null end
from ${businesses}
cross join lateral generate_series(1, b.n) g(i)
on conflict do nothing;

insert into public.messages (id, business_id, conversation_id, direction, channel, body, status, ai_generated, created_at, updated_at, content_expires_at)
select md5(concat_ws(':', 'qp', 'msg', b.id::text, g.i::text))::uuid, b.id,
  md5(concat_ws(':', 'qp', 'conv', b.id::text, (g.i % 500)::text))::uuid,
  case when g.i % 2 = 0 then 'inbound' else 'outbound' end,
  'web_chat', 'fixture message ' || g.i::text, 'delivered', false,
  now() - ((g.i % 720) || ' days')::interval - ((g.i % 86400) || ' seconds')::interval,
  now(),
  case when g.i % 10 = 0 then now() - ((g.i % 720) || ' days')::interval + interval '1 day' else null end
from ${businesses}
cross join lateral generate_series(1, b.n) g(i)
on conflict do nothing;

insert into public.transcripts (id, business_id, call_id, sequence, speaker, text, final, created_at, updated_at, expires_at)
select md5(concat_ws(':', 'qp', 'tr', b.id::text, g.i::text))::uuid, b.id,
  md5(concat_ws(':', 'qp', 'call', b.id::text, g.i::text))::uuid,
  1, 'agent', 'fixture transcript ' || g.i::text, true, now(), now(),
  case when g.i % 5 = 0 then now() - interval '1 hour' else null end
from ${businesses}
cross join lateral generate_series(1, b.n) g(i)
on conflict do nothing;

insert into public.storage_objects (id, business_id, object_key, purpose, file_name, content_type, status, expires_at, retention_until, created_at, updated_at)
select md5(concat_ws(':', 'qp', 'obj', b.id::text, g.i::text))::uuid, b.id,
  'qp/' || b.id::text || '/' || g.i::text, 'knowledge', 'f' || g.i::text || '.txt', 'text/plain',
  case when g.i % 25 = 0 then 'pending' else 'ready' end,
  case when g.i % 25 = 0 then now() - interval '1 hour' else now() + interval '30 days' end,
  case when g.i % 10 = 0 then now() - interval '1 hour' else now() + interval '60 days' end,
  now(), now()
from ${businesses}
cross join lateral generate_series(1, b.n) g(i)
on conflict do nothing;

insert into public.storage_objects (id, business_id, object_key, purpose, file_name, content_type, status, expires_at, retention_until, created_at, updated_at)
select md5(concat_ws(':', 'qp', 'rec', b.id::text, g.i::text))::uuid, b.id,
  'qp-rec/' || b.id::text || '/' || g.i::text, 'recording', 'r' || g.i::text || '.wav', 'audio/wav', 'ready',
  now() + interval '30 days',
  case when g.i % 80 = 0 then now() - interval '1 hour' else now() + interval '90 days' end,
  now(), now()
from ${businesses}
cross join lateral generate_series(1, b.n / 20) g(i)
on conflict do nothing;

insert into public.appointments (id, business_id, contact_id, staff_id, service_id, starts_at, ends_at, timezone, status, source_channel, calendar_sync_state, created_at, updated_at)
select md5(concat_ws(':', 'qp', 'appt', b.id::text, g.i::text))::uuid, b.id,
  md5(concat_ws(':', 'qp', 'contact', b.id::text, (g.i % 300)::text))::uuid,
  md5(concat_ws(':', 'qp', 'staff', b.id::text, (g.i % 5)::text))::uuid,
  md5(concat_ws(':', 'qp', 'service', b.id::text))::uuid,
  date_trunc('day', now()) - interval '365 days' + ((g.i % 4000) || ' minutes')::interval,
  date_trunc('day', now()) - interval '365 days' + ((g.i % 4000) || ' minutes')::interval + interval '30 minutes',
  'UTC', case when g.i % 20 = 0 then 'canceled' else 'completed' end, 'voice', 'not_required',
  now() - ((g.i % 720) || ' days')::interval, now()
from ${appointmentBusinesses}
cross join lateral generate_series(1, b.n) g(i)
on conflict do nothing;

insert into public.calendar_connections (id, business_id, owner_user_id, staff_id, provider, external_account_id, status, last_synced_at)
select md5(concat_ws(':', 'qp', 'conn', b.id::text, n::text))::uuid, b.id, '${USER_ID}'::uuid,
  md5(concat_ws(':', 'qp', 'staff', b.id::text, n::text))::uuid, 'google',
  'qp-acct-' || b.id::text || '-' || n::text, 'connected', now()
from (values ('${BUSINESS_A}'::uuid), ('${BUSINESS_B}'::uuid), ('${BUSINESS_C}'::uuid)) as b(id), generate_series(0, 1) n
on conflict do nothing;

insert into public.calendar_busy_blocks (id, business_id, connection_id, staff_id, starts_at, ends_at, external_event_id, created_at, updated_at)
select md5(concat_ws(':', 'qp', 'busy', b.id::text, g.i::text))::uuid, b.id,
  md5(concat_ws(':', 'qp', 'conn', b.id::text, (g.i % 2)::text))::uuid,
  md5(concat_ws(':', 'qp', 'staff', b.id::text, (g.i % 2)::text))::uuid,
  date_trunc('day', now()) - interval '100 days' + ((g.i % 6000) || ' minutes')::interval,
  date_trunc('day', now()) - interval '100 days' + ((g.i % 6000) || ' minutes')::interval + interval '45 minutes',
  'qp-evt-' || b.id::text || '-' || g.i::text, now(), now()
from ${busyBusinesses}
cross join lateral generate_series(1, b.n) g(i)
on conflict do nothing;

insert into public.inbox_items (id, business_id, kind, title, body, status, content_retention_status, content_expires_at, created_at, updated_at)
select md5(concat_ws(':', 'qp', 'inbox', b.id::text, g.i::text))::uuid, b.id, 'follow_up', 'fixture', 'fixture body', 'open',
  case when g.i % 2 = 0 then 'active' else 'scrubbed' end,
  case when g.i % 10 = 0 then now() - interval '1 hour' else now() + interval '30 days' end, now(), now()
from ${businesses}
cross join lateral generate_series(1, b.n) g(i)
on conflict do nothing;

insert into public.operator_notification_deliveries (id, business_id, user_id, event_kind, event_key, channel, status, destination, subject, body, content_expires_at, created_at, updated_at)
select md5(concat_ws(':', 'qp', 'ond', b.id::text, g.i::text))::uuid, b.id, '${USER_ID}'::uuid, 'daily_summary',
  'qp-ond-' || b.id::text || '-' || g.i::text, case when g.i % 2 = 0 then 'email' else 'sms' end, 'sent', 'dest', 'subj', 'body',
  case when g.i % 10 = 0 then now() - interval '1 hour' else now() + interval '30 days' end, now(), now()
from ${businesses}
cross join lateral generate_series(1, b.n) g(i)
on conflict do nothing;

commit;
`;
}

async function dropFixtures(migrator: DatabaseClient): Promise<void> {
  await migrator.pool.query("delete from public.businesses where slug like $1", [`${FIXTURE_SLUG_PREFIX}%`]);
  await migrator.pool.query("delete from public.users where id = $1", [USER_ID]);
}

async function countFixtures(migrator: DatabaseClient): Promise<number> {
  const result = await migrator.pool.query<{ count: string }>(
    "select count(*)::text as count from public.businesses where slug like $1",
    [`${FIXTURE_SLUG_PREFIX}%`],
  );
  return Number(result.rows[0]?.count ?? "0");
}

function collectNodes(node: Record<string, unknown>, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  out.push(node);
  for (const child of (node.Plans as Array<Record<string, unknown>> | undefined) ?? []) collectNodes(child, out);
  return out;
}

function numberField(node: Record<string, unknown>, key: string): number {
  const value = node[key];
  return typeof value === "number" ? value : 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

async function measure(client: DatabaseClient, owner: DatabaseClient, businessId: string, role: MeasurementRole, definition: CaseDefinition): Promise<PlanShape> {
  const actorType = role === "worker" ? "worker" : "operator";
  const userId = role === "worker" ? "" : USER_ID;
  const executionTimes: number[] = [];
  let representative: Record<string, unknown> | undefined;
  let planningMs = 0;

  for (let repeat = 0; repeat < MEASUREMENT_REPEATS; repeat += 1) {
    const connection = await client.pool.connect();
    let envelope: { Plan: Record<string, unknown>; "Planning Time": number; "Execution Time": number } | undefined;
    try {
      await connection.query("begin");
      await connection.query(
        "select set_config('app.user_id', $1, true), set_config('app.business_id', $2, true), set_config('app.actor_type', $3, true)",
        [userId, businessId, actorType],
      );
      const result = await connection.query(`explain (analyze, buffers, format json) ${definition.sql}`, definition.params);
      await connection.query("rollback");
      envelope = (result.rows[0] as { "QUERY PLAN": Array<{ Plan: Record<string, unknown>; "Planning Time": number; "Execution Time": number }> } | undefined)?.["QUERY PLAN"]?.[0];
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
    if (!envelope) throw new Error(`EXPLAIN returned no plan for ${definition.id}.`);
    if (!representative) representative = envelope.Plan;
    planningMs = envelope["Planning Time"];
    executionTimes.push(envelope["Execution Time"]);
    if (definition.table) await owner.pool.query(`vacuum (analyze) public."${definition.table}"`);
  }

  const plan = representative ?? {};
  const nodes = collectNodes(plan);
  const scans = nodes.filter((node) => typeof node["Node Type"] === "string" && String(node["Node Type"]).includes("Scan"));
  // Buffer counters are cumulative upward, so the first scan in a pre-order
  // walk is the outermost scan and its counters cover the whole scan subtree.
  const outerScanNode = scans[0];
  return {
    nodeTypes: [...new Set(nodes.map((node) => String(node["Node Type"])))],
    outerScan: outerScanNode ? `${String(outerScanNode["Node Type"])} on ${String(outerScanNode["Relation Name"] ?? outerScanNode["Index Name"] ?? "?")}` : "none",
    scanSummary: scans.map((node) => `${String(node["Node Type"])} on ${String(node["Relation Name"] ?? node["Index Name"] ?? "?")} rows=${numberField(node, "Actual Rows")} loops=${numberField(node, "Actual Loops")}`).join("; "),
    scanRows: outerScanNode ? numberField(outerScanNode, "Actual Rows") : 0,
    scanBuffers: outerScanNode ? numberField(outerScanNode, "Shared Hit Blocks") + numberField(outerScanNode, "Shared Read Blocks") : 0,
    planRows: numberField(plan, "Plan Rows"),
    actualRows: numberField(plan, "Actual Rows"),
    sharedHitBlocks: numberField(plan, "Shared Hit Blocks"),
    sharedReadBlocks: numberField(plan, "Shared Read Blocks"),
    sharedWrittenBlocks: numberField(plan, "Shared Written Blocks"),
    executionMs: median(executionTimes),
    medianExecutionMs: median(executionTimes),
    planningMs,
  };
}

function buildCases(): CaseDefinition[] {
  const windowStart = new Date(Date.now() - 365 * 86_400_000 + 30 * 3_600_000);
  const windowEnd = new Date(windowStart.getTime() + 3_600_000);
  const busyWindowStart = new Date(Date.now() - 100 * 86_400_000 + 50 * 3_600_000);
  const busyWindowEnd = new Date(busyWindowStart.getTime() + 3_600_000);
  const chartStart = new Date(Date.now() - 30 * 86_400_000);
  const previousStart = new Date(Date.now() - 60 * 86_400_000);
  const staffIds = [0, 1, 2, 3, 4].map((index) => fixtureUuid("staff", BUSINESS_A, index));
  const connectionIds = [0, 1].map((index) => fixtureUuid("conn", BUSINESS_A, index));

  return [
    {
      id: "sweep.messages",
      role: "worker",
      source: "packages/domain/src/server/privacy.ts:29",
      sql: "update public.messages set body = '[content expired]', media = null, content_expires_at = null, updated_at = now() where business_id = $1::uuid and content_expires_at is not null and content_expires_at < now() returning id",
      params: [BUSINESS_A],
      table: "messages",
    },
    {
      id: "sweep.transcripts",
      role: "worker",
      source: "packages/domain/src/server/privacy.ts:33",
      sql: "delete from public.transcripts where business_id = $1::uuid and expires_at is not null and expires_at < now() returning call_id",
      params: [BUSINESS_A],
      table: "transcripts",
    },
    {
      id: "sweep.inbox_items",
      role: "worker",
      source: "packages/domain/src/server/privacy.ts:25",
      sql: "update public.inbox_items set title = '[content expired]', body = '[content expired]', content_retention_status = 'scrubbed', updated_at = now() where business_id = $1::uuid and content_retention_status = 'active' and content_expires_at is not null and content_expires_at < now() returning id",
      params: [BUSINESS_A],
      table: "inbox_items",
    },
    {
      id: "sweep.operator_deliveries",
      role: "worker",
      source: "packages/domain/src/server/privacy.ts:36",
      sql: "update public.operator_notification_deliveries set subject = '[content expired]', body = '[content expired]', destination = '[expired]', sender = null, content_expires_at = '9999-12-31T00:00:00.000Z', updated_at = now() where business_id = $1::uuid and content_expires_at < now() returning id",
      params: [BUSINESS_A],
      table: "operator_notification_deliveries",
    },
    {
      id: "sweep.recordings",
      role: "worker",
      source: "packages/domain/src/server/privacy.ts:40",
      sql: "select calls.id as call_id, storage_objects.id as object_id from public.calls inner join public.storage_objects on storage_objects.id = calls.recording_object_id where calls.business_id = $1::uuid and storage_objects.business_id = $1::uuid and storage_objects.purpose = 'recording' and storage_objects.status = 'ready' and storage_objects.retention_until is not null and storage_objects.retention_until < now()",
      params: [BUSINESS_A],
    },
    {
      id: "sweep.storage_upload",
      role: "worker",
      source: "packages/domain/src/server/storage.ts:201",
      sql: "select id from public.storage_objects where business_id = $1::uuid and status in ('pending', 'deleting_expired_upload') and expires_at is not null and expires_at < now() order by expires_at, id limit 500 for update skip locked",
      params: [BUSINESS_A],
    },
    {
      id: "sweep.storage_retained",
      role: "worker",
      source: "packages/domain/src/server/storage.ts:207",
      sql: "select id from public.storage_objects where business_id = $1::uuid and status not in ('deleted', 'deleting_expired_upload') and retention_until is not null and retention_until < now() and purpose <> 'recording' order by retention_until, id limit 500 for update skip locked",
      params: [BUSINESS_A],
    },
    {
      id: "booking.appointments_overlap",
      role: "app",
      source: "packages/domain/src/server/booking.ts:105",
      sql: "select staff_id, starts_at, ends_at from public.appointments where business_id = $1::uuid and status <> 'canceled' and staff_id = any($2::uuid[]) and starts_at < $3::timestamptz and ends_at > $4::timestamptz",
      params: [BUSINESS_A, staffIds, windowEnd, windowStart],
    },
    {
      id: "booking.calendar_busy",
      role: "app",
      source: "packages/domain/src/server/booking.ts:108",
      sql: "select id from public.calendar_busy_blocks where business_id = $1::uuid and connection_id = any($2::uuid[]) and starts_at < $3::timestamptz and ends_at > $4::timestamptz",
      params: [BUSINESS_A, connectionIds, busyWindowEnd, busyWindowStart],
    },
    {
      id: "dashboard.appointments_created",
      role: "app",
      source: "packages/db/src/dashboard-aggregates.ts:26",
      sql: "select count(*)::int from public.appointments where business_id = $1::uuid and created_at >= $2::timestamptz",
      params: [BUSINESS_A, chartStart],
    },
    {
      id: "dashboard.appointments_previous_window",
      role: "app",
      source: "packages/db/src/dashboard-aggregates.ts:27",
      sql: "select count(*)::int from public.appointments where business_id = $1::uuid and created_at >= $2::timestamptz and created_at < $3::timestamptz",
      params: [BUSINESS_A, previousStart, chartStart],
    },
    {
      id: "dashboard.messages_created",
      role: "app",
      source: "packages/db/src/dashboard-aggregates.ts:28",
      sql: "select count(*)::int from public.messages where business_id = $1::uuid and created_at >= $2::timestamptz",
      params: [BUSINESS_A, chartStart],
    },
  ];
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const reseed = args.has("--reseed");
  const labelArg = [...args].find((argument) => argument.startsWith("--label="));
  const outArg = [...args].find((argument) => argument.startsWith("--out="));
  const label = labelArg?.slice("--label=".length) ?? "current";
  const outPath = outArg?.slice("--out=".length);

  const migratorUrl = loopbackUrl("QUERY_PLAN_CHECK_DATABASE_URL");
  const appUrl = loopbackUrl("QUERY_PLAN_CHECK_APP_DATABASE_URL");
  const workerUrl = loopbackUrl("QUERY_PLAN_CHECK_WORKER_DATABASE_URL");

  const migrator = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: migratorUrl });
  const app = createDatabaseClient("lobbystack_app", { LOBBYSTACK_APP_DATABASE_URL: appUrl });
  const worker = createDatabaseClient("lobbystack_worker", { LOBBYSTACK_WORKER_DATABASE_URL: workerUrl });
  for (const client of [migrator, app, worker]) {
    client.pool.on("connect", (connection) => {
      void connection.query("set statement_timeout = '60s'").catch(() => undefined);
    });
  }

  const startedAt = Date.now();
  try {
    for (const [client, expected] of [[migrator, "lobbystack"], [app, "lobbystack_app"], [worker, "lobbystack_worker"]] as const) {
      const identity = await client.pool.query<{ current_user: string }>("select current_user");
      if (identity.rows[0]?.current_user !== expected) {
        throw new Error(`Expected ${client.role} to connect as ${expected}, got ${identity.rows[0]?.current_user ?? "none"}.`);
      }
    }

    if (reseed) await dropFixtures(migrator);
    if (await countFixtures(migrator) === 0) {
      await migrator.pool.query(fixtureSql());
      console.log("Seeded synthetic tenants.");
    } else {
      console.log("Reusing existing synthetic tenants (pass --reseed to recreate).");
    }
    await migrator.pool.query("analyze public.businesses, public.users, public.business_memberships, public.staff, public.services, public.contacts, public.conversations, public.calls, public.messages, public.transcripts, public.storage_objects, public.appointments, public.calendar_connections, public.calendar_busy_blocks, public.inbox_items, public.operator_notification_deliveries");

    const cases: Array<CaseDefinition & { plan: PlanShape }> = [];
    for (const definition of buildCases()) {
      const client = definition.role === "worker" ? worker : app;
      const plan = await measure(client, migrator, BUSINESS_A, definition.role, definition);
      cases.push({ ...definition, plan });
      console.log(`${definition.id}: ${plan.medianExecutionMs.toFixed(3)} ms | root hit=${plan.sharedHitBlocks} read=${plan.sharedReadBlocks} | scan ${plan.outerScan} rows=${plan.scanRows} buffers=${plan.scanBuffers} | ${plan.nodeTypes.join(",")}`);
    }

    const report = {
      label,
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      durationMs: Date.now() - startedAt,
      repeats: MEASUREMENT_REPEATS,
      businessId: BUSINESS_A,
      cases: cases.map(({ id, role, source, params: _params, plan }) => ({ id, role, source, plan })),
    };
    if (outPath) await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ label, cases: report.cases.length, out: outPath ?? null }));
  } finally {
    await Promise.all([migrator.pool.end(), app.pool.end(), worker.pool.end()].map((promise) => promise.catch(() => undefined)));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
