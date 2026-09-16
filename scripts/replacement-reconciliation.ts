import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDatabaseClient } from "@lobbystack/db";
import { sql } from "drizzle-orm";

const mappings = [
  ["businesses", "businesses"],
  ["contacts", "contacts"],
  ["appointments", "appointments"],
  ["inbox_items", "inboxItems"],
  ["knowledge_documents", "knowledgeDocumentSettings"],
  ["billing_accounts", "billingAccounts"],
  ["billing_usage_events", "billingUsageEvents"],
  ["sms_consent_events", "smsConsentEvents"],
  ["feedback_submissions", "feedbackSubmissions"],
  ["audit_logs", "auditLogs"],
  ["unit_economics_events", "unitEconomicsEvents"],
] as const;

async function main(): Promise<void> {
  const sourceArg = process.argv.find((argument) => argument.startsWith("--source="))?.slice("--source=".length);
  const source = sourceArg ? JSON.parse(await readFile(resolve(sourceArg), "utf8")) as Record<string, unknown[]> : undefined;
  const client = createDatabaseClient("lobbystack_migrator");
  const failures: string[] = [];
  try {
    const rowCounts = [];
    for (const [table, sourceKey] of mappings) {
      const result = await client.db.execute<{ total_rows: string; mapped_rows: string; duplicate_ids: string; samples: string[] | null }>(sql.raw(`
        select count(*)::text as total_rows,
          count(*) filter (where legacy_convex_id is not null)::text as mapped_rows,
          (select count(*)::text from (select legacy_convex_id from public.${table} where legacy_convex_id is not null group by legacy_convex_id having count(*) > 1) duplicates) as duplicate_ids,
          (select array_agg(legacy_convex_id order by legacy_convex_id) from (select legacy_convex_id from public.${table} where legacy_convex_id is not null order by legacy_convex_id limit 5) samples) as samples
        from public.${table}
      `));
      const row = result.rows[0];
      const expectedRows = source?.[sourceKey]?.length;
      const mappedRows = Number(row?.mapped_rows ?? 0);
      if (expectedRows !== undefined && expectedRows !== mappedRows) failures.push(`${table}: expected ${expectedRows} imported rows, found ${mappedRows}`);
      if (Number(row?.duplicate_ids ?? 0) > 0) failures.push(`${table}: duplicate legacyConvexId mappings found`);
      rowCounts.push({ table, sourceKey, expectedRows: expectedRows ?? null, totalRows: Number(row?.total_rows ?? 0), mappedRows, duplicateLegacyIds: Number(row?.duplicate_ids ?? 0), samples: row?.samples ?? [] });
    }

    const relationships = await client.db.execute<{ relationship: string; orphan_count: string }>(sql`
      select 'billing_accounts.business_id' as relationship, count(*)::text as orphan_count from billing_accounts a left join businesses b on b.id = a.business_id where b.id is null
      union all select 'inbox_items.related_call_id', count(*)::text from inbox_items i left join calls c on c.id = i.related_call_id and c.business_id = i.business_id where i.related_call_id is not null and c.id is null
      union all select 'billing_usage_events.business_id', count(*)::text from billing_usage_events e left join businesses b on b.id = e.business_id where b.id is null
      union all select 'sms_consent_events.contact_id', count(*)::text from sms_consent_events e left join contacts c on c.id = e.contact_id where e.contact_id is not null and c.id is null
      union all select 'feedback_submissions.user_id', count(*)::text from feedback_submissions f left join users u on u.id = f.user_id where u.id is null
      union all select 'audit_logs.business_id', count(*)::text from audit_logs a left join businesses b on b.id = a.business_id where b.id is null
      union all select 'unit_economics_events.business_id', count(*)::text from unit_economics_events e left join businesses b on b.id = e.business_id where b.id is null
    `);
    for (const row of relationships.rows) if (Number(row.orphan_count) > 0) failures.push(`${row.relationship}: ${row.orphan_count} orphaned rows`);

    for (const value of source?.knowledgeDocumentSettings ?? []) {
      if (!value || typeof value !== "object" || !("_id" in value) || typeof value._id !== "string") { failures.push("knowledge_documents: invalid source settings row"); continue; }
      const document = value as { _id: string; active?: unknown };
      const result = await client.db.execute<{ active: boolean }>(sql`select active from knowledge_documents where legacy_convex_id = ${document._id}`);
      if (result.rows[0]?.active !== (document.active !== false)) failures.push(`knowledge_documents: activity differs for ${document._id}`);
    }

    const aggregateDifferences = await client.db.execute<{ business_id: string; period_key: string; voice_difference: string; sms_difference: string; transfer_difference: string }>(sql`
      with event_totals as (
        select business_id, period_key,
          coalesce(sum(quantity) filter (where usage_kind = 'voice_seconds'), 0) as voice_seconds,
          coalesce(sum(quantity) filter (where usage_kind = 'alert_sms_segments'), 0) as sms_segments,
          coalesce(sum(quantity) filter (where usage_kind = 'outbound_call_attempts'), 0) as transfer_attempts
        from billing_usage_events group by business_id, period_key
      )
      select m.business_id::text, m.period_key,
        abs(m.voice_seconds_used - e.voice_seconds)::text as voice_difference,
        abs(m.alert_sms_segments_used - e.sms_segments)::text as sms_difference,
        abs(m.outbound_call_attempts_used - e.transfer_attempts)::text as transfer_difference
      from billing_usage_months m join event_totals e using (business_id, period_key)
      where abs(m.voice_seconds_used - e.voice_seconds) > 0.000001
         or abs(m.alert_sms_segments_used - e.sms_segments) > 0.000001
         or abs(m.outbound_call_attempts_used - e.transfer_attempts) > 0.000001
    `);
    for (const row of aggregateDifferences.rows) failures.push(`billing aggregate mismatch for ${row.business_id}/${row.period_key}`);

    const report = {
      ok: failures.length === 0,
      generatedAt: new Date().toISOString(),
      sourceFile: sourceArg ?? null,
      rowCounts,
      relationships: relationships.rows.map((row) => ({ relationship: row.relationship, orphanCount: Number(row.orphan_count) })),
      aggregateDifferences: aggregateDifferences.rows,
      failures,
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await client.pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
