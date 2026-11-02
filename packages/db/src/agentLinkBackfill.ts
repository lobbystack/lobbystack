import { setTimeout as sleep } from "node:timers/promises";

import { sql } from "drizzle-orm";

import type { Database } from "./client";

// calls and conversations can be too large to fill in the transaction of a
// migration, which would hold a row lock on every row until it committed. So
// `migrate` runs this after the migrations, and each batch commits on its own.
// New rows don't depend on it: the trigger from 0184 fills agent_id on insert
// and on any update. It can stop at any point and pick up where it left off.
// Slice 8 removes it. The next release validates the checks it satisfies.

const TABLES = ["calls", "conversations"] as const;
const BATCH_SIZE = 1_000;
const PAUSE_MS = 25;
// A release gives the migrate schedule 30 minutes. Stopping early leaves the
// rest to the next `migrate`, or to `backfill-agent-links`.
const TIME_LIMIT_MS = 20 * 60_000;
// A row locked during a pass is usually being updated, and the trigger fills
// it. Looking again catches the ones that were only locked.
const MAX_PASSES = 3;

export type AgentLinkBackfillResult = { table: (typeof TABLES)[number]; filled: number; remaining: number };

type BackfillOptions = { batchSize?: number; pauseMs?: number; timeLimitMs?: number; log?: (message: string) => void };

async function fillBatch(db: Database, table: string, after: string | null, batchSize: number): Promise<{ lastId: string | null; filled: number; skipped: number }> {
  const target = sql.identifier(table);
  // Keyset by primary key, so that the whole table is read once and not once
  // per batch. SKIP LOCKED keeps it from waiting on a live call's row, and the
  // update names only agent_id, so updated_at stays when the row last changed.
  const result = await db.execute<{ last_id: string | null; filled: string; skipped: string }>(sql`
    with batch as (
      select id from public.${target}
      where ${after === null ? sql`true` : sql`id > ${after}::uuid`}
      order by id
      limit ${batchSize}
    ), unfilled as (
      select id from public.${target}
      where id in (select id from batch) and agent_id is null
    ), claimed as (
      select pending.id, pending.business_id from public.${target} pending
      where pending.id in (select id from unfilled) and pending.agent_id is null
      for update of pending skip locked
    ), filled as (
      update public.${target} pending
      set agent_id = agent.id
      from claimed
      join public.agents agent on agent.business_id = claimed.business_id and agent.is_default
      where pending.id = claimed.id
      returning pending.id
    )
    select
      (select id::text from batch order by id desc limit 1) as last_id,
      (select count(*) from filled)::text as filled,
      ((select count(*) from unfilled) - (select count(*) from claimed))::text as skipped
  `);
  const row = result.rows[0];
  return { lastId: row?.last_id ?? null, filled: Number(row?.filled ?? 0), skipped: Number(row?.skipped ?? 0) };
}

/** Fills agent_id on rows from before migrations 0185 and 0186, a batch at a time. Run it outside a transaction. */
export async function backfillAgentLinks(db: Database, options: BackfillOptions = {}): Promise<AgentLinkBackfillResult[]> {
  const { batchSize = BATCH_SIZE, pauseMs = PAUSE_MS, timeLimitMs = TIME_LIMIT_MS, log = () => undefined } = options;
  const deadline = Date.now() + timeLimitMs;
  const results: AgentLinkBackfillResult[] = [];
  for (const table of TABLES) {
    let filled = 0;
    for (let pass = 0; pass < MAX_PASSES && Date.now() < deadline; pass += 1) {
      let after: string | null = null;
      let skipped = 0;
      while (Date.now() < deadline) {
        const batch = await fillBatch(db, table, after, batchSize);
        filled += batch.filled;
        skipped += batch.skipped;
        if (batch.lastId === null) break;
        after = batch.lastId;
        if (batch.filled > 0 && pauseMs > 0) await sleep(pauseMs);
      }
      if (skipped === 0) break;
    }
    const counted = await db.execute<{ remaining: string }>(sql`select count(*)::text as remaining from public.${sql.identifier(table)} where agent_id is null`);
    const remaining = Number(counted.rows[0]?.remaining ?? 0);
    results.push({ table, filled, remaining });
    log(`Agent backfill: ${table} filled ${filled}, ${remaining} left.`);
  }
  return results;
}
