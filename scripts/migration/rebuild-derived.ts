import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertRehearsalTarget } from "./rehearsal-import.ts";

// ---------------------------------------------------------------------------
// Pure core
//
// Everything in this section operates on plain values only. It never touches a
// database, filesystem, environment, or clock, so it can be unit-tested without
// infrastructure. Reports and errors carry aggregate counts and stable codes
// only; no customer row value is ever included.
// ---------------------------------------------------------------------------

export type RollupTarget = { businessId: string; monthKey: string };

export function monthKeyFor(value: string | number | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}

/** Deterministic, order-independent set of (business, month) rollup targets. */
export function deriveRollupTargets(rows: ReadonlyArray<RollupTarget>): RollupTarget[] {
  const seen = new Set<string>();
  const targets: RollupTarget[] = [];
  for (const row of rows) {
    const key = `${row.businessId}\u0000${row.monthKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ businessId: row.businessId, monthKey: row.monthKey });
  }
  return targets.sort((left, right) => {
    if (left.businessId !== right.businessId) return left.businessId < right.businessId ? -1 : 1;
    if (left.monthKey !== right.monthKey) return left.monthKey < right.monthKey ? -1 : 1;
    return 0;
  });
}

export type AffiliateCommissionRow = { affiliateProfileId: string; status: string; commissionCents: number };
export type AffiliateStatsRow = {
  affiliateProfileId: string;
  clickCount: number;
  referralCount: number;
  conversionCount: number;
  pendingCommissionCents: number;
  paidCommissionCents: number;
};

const CONVERTED_COMMISSION_STATUSES = new Set(["pending", "paid"]);

/**
 * Recomputes the incremental affiliate counters from their authoritative
 * sources. A conversion is a non-voided commission; pending/paid cents are the
 * sums held by the domain ledger status. One row is emitted per profile, even
 * when the profile has no activity, so presence reconciliation passes.
 */
export function aggregateAffiliateStats(input: {
  profileIds: ReadonlyArray<string>;
  attributions: ReadonlyArray<{ affiliateProfileId: string }>;
  clicks: ReadonlyArray<{ affiliateProfileId: string }>;
  commissions: ReadonlyArray<AffiliateCommissionRow>;
}): AffiliateStatsRow[] {
  const stats = new Map<string, AffiliateStatsRow>();
  for (const id of input.profileIds) {
    if (!stats.has(id)) {
      stats.set(id, { affiliateProfileId: id, clickCount: 0, referralCount: 0, conversionCount: 0, pendingCommissionCents: 0, paidCommissionCents: 0 });
    }
  }
  for (const row of input.attributions) {
    const entry = stats.get(row.affiliateProfileId);
    if (entry) entry.referralCount += 1;
  }
  for (const row of input.clicks) {
    const entry = stats.get(row.affiliateProfileId);
    if (entry) entry.clickCount += 1;
  }
  for (const row of input.commissions) {
    const entry = stats.get(row.affiliateProfileId);
    if (!entry) continue;
    if (!CONVERTED_COMMISSION_STATUSES.has(row.status)) continue;
    entry.conversionCount += 1;
    if (row.status === "pending") entry.pendingCommissionCents += row.commissionCents;
    else entry.paidCommissionCents += row.commissionCents;
  }
  return [...stats.values()].sort((left, right) => {
    if (left.affiliateProfileId === right.affiliateProfileId) return 0;
    return left.affiliateProfileId < right.affiliateProfileId ? -1 : 1;
  });
}

export type RebuildArgs = { database: string; reportPath: string; runId: string; deployment: string; apply: boolean };

export function planMode(apply: boolean): "planned" | "apply" {
  return apply ? "apply" : "planned";
}

/** Pure argv parser. Unknown flags are ignored; `--apply` opts into mutation. */
export function parseRebuildArgs(argv: ReadonlyArray<string>): RebuildArgs {
  const value = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const match = argv.find((argument) => argument.startsWith(prefix));
    return match?.slice(prefix.length);
  };
  const database = value("database");
  const reportPath = value("report");
  if (!database || !reportPath) throw new Error("REHEARSAL_CONFIGURATION_REQUIRED");
  return {
    database,
    reportPath,
    runId: value("run-id") ?? "UNASSIGNED",
    deployment: value("deployment") ?? "UNASSIGNED",
    apply: argv.includes("--apply"),
  };
}

/** A rebuild may only add `realtime.publish` rows, exactly one per rebuilt derived row. */
export function assertOutboxGuard(input: {
  before: number;
  after: number;
  nonRealtimeBefore: number;
  nonRealtimeAfter: number;
  expectedInserted: number;
}): { inserted: number } {
  const inserted = input.after - input.before;
  const nonRealtimeInserted = input.nonRealtimeAfter - input.nonRealtimeBefore;
  if (inserted < 0 || nonRealtimeInserted !== 0 || inserted !== input.expectedInserted) throw new Error("UNEXPECTED_REBUILD_SIDE_EFFECT");
  return { inserted };
}

const SKIPPED_DOMAINS: ReadonlyArray<{ domain: string; status: "skipped" | "not_implemented"; reason: string }> = [
  { domain: "calendar_busy_blocks", status: "skipped", reason: "NO_DETERMINISTIC_LOCAL_SOURCE" },
  { domain: "sms_consent_states", status: "not_implemented", reason: "NO_REBUILD_OWNER_IN_REHEARSAL" },
  { domain: "auth_email_claims", status: "not_implemented", reason: "NO_REBUILD_OWNER_IN_REHEARSAL" },
  { domain: "user_email_claims", status: "not_implemented", reason: "NO_REBUILD_OWNER_IN_REHEARSAL" },
];

// ---------------------------------------------------------------------------
// CLI / database I/O
// ---------------------------------------------------------------------------

type BusinessesRow = { id: string; business_type: string; telemetry_enabled: boolean };

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z_]+(?::[a-zA-Z0-9_,]+)*$/.test(error.message)) return error.message;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return `REBUILD_BLOCKED:PG_${code}`;
  return "REBUILD_BLOCKED_REDACTED";
}

async function main(): Promise<void> {
  const args = parseRebuildArgs(process.argv.slice(2));
  const url = process.env.REHEARSAL_DATABASE_URL;
  const workerUrl = process.env.REHEARSAL_WORKER_DATABASE_URL;
  const nonce = process.env.REHEARSAL_TARGET_NONCE;
  if (!url || !workerUrl || !nonce) throw new Error("REHEARSAL_CONFIGURATION_REQUIRED");
  assertRehearsalTarget(url, args.database);
  const expected = new URL(url);
  const workerTarget = new URL(workerUrl);
  if (
    workerTarget.username !== "lobbystack_worker" ||
    workerTarget.host !== expected.host ||
    workerTarget.pathname !== expected.pathname ||
    workerTarget.search ||
    workerTarget.hash
  ) throw new Error("WORKER_TARGET_MISMATCH");

  const { createDatabaseClient } = await import("@lobbystack/db");
  const { refreshBusinessSnapshot, loadLatestBusinessSnapshot, refreshUnitEconomicsMonth } = await import("@lobbystack/domain");
  const { snapshotSchema } = await import("@lobbystack/contracts");
  const admin = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: url });
  const worker = createDatabaseClient("lobbystack_worker", { DATABASE_URL: workerUrl });
  const report = await open(args.reportPath, "wx", 0o600);
  const evidence: Record<string, unknown> = {
    runId: args.runId,
    deployment: args.deployment,
    mode: "derived-rebuild",
    database: args.database,
    marker: null,
    planned: null,
    perDomain: {},
    skipped: SKIPPED_DOMAINS,
    outbox: { before: 0, after: 0, inserted: 0, nonRealtimeInserted: 0, expected: 0 },
    status: "failed",
    releaseCertified: false,
    owner: "UNASSIGNED",
    reviewer: "UNASSIGNED",
    startedAt: new Date().toISOString(),
  };
  const count = async (text: string): Promise<number> => {
    const result = await admin.pool.query<{ count: number }>(text);
    return Number(result.rows[0]?.count ?? 0);
  };
  try {
    const marker = await admin.pool.query<{ database_name: string; nonce: string }>("SELECT database_name, nonce FROM migration_control.target");
    if (marker.rows.length !== 1 || marker.rows[0]?.database_name !== args.database || marker.rows[0]?.nonce !== nonce) throw new Error("DATABASE_TARGET_MARKER_MISMATCH");
    evidence.marker = { table: "migration_control.target", databaseName: args.database, nonceMatched: true };

    const businesses = await admin.pool.query<BusinessesRow>("SELECT id, business_type, telemetry_enabled FROM public.businesses ORDER BY id");
    const profiles = await admin.pool.query<{ id: string }>("SELECT id FROM public.affiliate_profiles ORDER BY id");
    const rollupTargets = deriveRollupTargets(
      (await admin.pool.query<{ business_id: string; month_key: string }>("SELECT DISTINCT business_id, month_key FROM public.unit_economics_events")).rows.map((row) => ({
        businessId: row.business_id,
        monthKey: row.month_key,
      })),
    );
    evidence.planned = {
      businesses: businesses.rows.length,
      affiliateProfiles: profiles.rows.length,
      unitEconomicsMonths: rollupTargets.length,
      calendarBusyBlocks: await count("SELECT count(*)::int AS count FROM public.calendar_busy_blocks"),
    };
    if (planMode(args.apply) === "planned") {
      evidence.status = "planned";
      return;
    }

    const outboxBefore = await count("SELECT count(*)::int AS count FROM public.outbox_messages");
    const outboxNonRealtimeBefore = await count("SELECT count(*)::int AS count FROM public.outbox_messages WHERE topic <> 'realtime.publish'");

    // business_context_snapshots: reuse the domain refresh, which enqueues one
    // realtime.publish event per business. Clear first so a replay is exact.
    await admin.pool.query("DELETE FROM public.business_context_snapshots");
    let snapshots = 0;
    for (const business of businesses.rows) {
      await refreshBusinessSnapshot({ db: worker.db }, { businessId: business.id });
      const snapshot = snapshotSchema.parse(await loadLatestBusinessSnapshot({ db: worker.db }, { businessId: business.id }));
      const expectedType = ["clinic", "repair_shop", "salon", "service_company"].includes(business.business_type) ? business.business_type : "other";
      if (snapshot.businessId !== business.id || snapshot.businessType !== expectedType || snapshot.telemetryEnabled !== business.telemetry_enabled) throw new Error("REBUILT_SNAPSHOT_FACT_MISMATCH");
      snapshots += 1;
    }

    // unit_economics_rollups: one rollup per (business, month) actually present.
    await admin.pool.query("DELETE FROM public.unit_economics_rollups");
    for (const target of rollupTargets) {
      await refreshUnitEconomicsMonth({ db: worker.db }, { businessId: target.businessId, monthKey: target.monthKey });
    }

    // affiliate_profile_stats: deterministic recomputation from the ledger.
    const attributions = (await admin.pool.query<{ affiliateProfileId: string }>('SELECT affiliate_profile_id AS "affiliateProfileId" FROM public.affiliate_attributions')).rows;
    const clicks = (await admin.pool.query<{ affiliateProfileId: string }>('SELECT affiliate_profile_id AS "affiliateProfileId" FROM public.affiliate_clicks')).rows;
    const commissions = (
      await admin.pool.query<AffiliateCommissionRow>('SELECT affiliate_profile_id AS "affiliateProfileId", status, commission_cents AS "commissionCents" FROM public.affiliate_commissions')
    ).rows;
    const stats = aggregateAffiliateStats({ profileIds: profiles.rows.map((profile) => profile.id), attributions, clicks, commissions });
    await admin.pool.query("DELETE FROM public.affiliate_profile_stats");
    for (const row of stats) {
      await admin.pool.query(
        `INSERT INTO public.affiliate_profile_stats (affiliate_profile_id, click_count, referral_count, conversion_count, pending_commission_cents, paid_commission_cents, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())
         ON CONFLICT (affiliate_profile_id) DO UPDATE SET click_count = EXCLUDED.click_count, referral_count = EXCLUDED.referral_count,
           conversion_count = EXCLUDED.conversion_count, pending_commission_cents = EXCLUDED.pending_commission_cents,
           paid_commission_cents = EXCLUDED.paid_commission_cents, updated_at = now()`,
        [row.affiliateProfileId, row.clickCount, row.referralCount, row.conversionCount, row.pendingCommissionCents, row.paidCommissionCents],
      );
    }

    const outboxAfter = await count("SELECT count(*)::int AS count FROM public.outbox_messages");
    const outboxNonRealtimeAfter = await count("SELECT count(*)::int AS count FROM public.outbox_messages WHERE topic <> 'realtime.publish'");
    const outboxGuard = assertOutboxGuard({
      before: outboxBefore,
      after: outboxAfter,
      nonRealtimeBefore: outboxNonRealtimeBefore,
      nonRealtimeAfter: outboxNonRealtimeAfter,
      expectedInserted: snapshots,
    });

    evidence.perDomain = {
      business_context_snapshots: snapshots,
      unit_economics_rollups: rollupTargets.length,
      affiliate_profile_stats: stats.length,
      calendar_busy_blocks: 0,
    };
    evidence.outbox = {
      before: outboxBefore,
      after: outboxAfter,
      inserted: outboxGuard.inserted,
      nonRealtimeInserted: outboxNonRealtimeAfter - outboxNonRealtimeBefore,
      expected: snapshots,
    };
    evidence.status = "passed";
  } catch (error) {
    evidence.error = safeErrorCode(error);
    process.exitCode = 1;
  } finally {
    await Promise.all([admin.pool.end(), worker.pool.end()]);
    evidence.finishedAt = new Date().toISOString();
    await report.writeFile(`${JSON.stringify(evidence, null, 2)}\n`);
    await report.close();
    console.log(JSON.stringify({ status: evidence.status, database: args.database, perDomain: evidence.perDomain, outbox: evidence.outbox, releaseCertified: false }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(() => {
    console.error("DERIVED_REBUILD_BLOCKED");
    process.exitCode = 1;
  });
}
