import { randomUUID } from "node:crypto";

import { getPool } from "@lobbystack/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { completeVoiceCall, startVoiceCall } from "./voice";

const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_APP);

describe.skipIf(!hasDatabase)("voice call lifecycle", () => {
  let pool: Pool;
  const businessId = randomUUID();
  const providerCallSid = `CA-${randomUUID()}`;

  beforeAll(async () => {
    pool = getPool("worker");
    await pool.query(
      `INSERT INTO app.businesses (id, slug, name, timezone)
       VALUES ($1, $2, $3, $4)`,
      [businessId, `voice-${businessId.slice(0, 8)}`, "Voice Test", "UTC"],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM app.outbox_messages WHERE business_id = $1`, [businessId]);
    await pool.query(`DELETE FROM app.businesses WHERE id = $1`, [businessId]);
    await pool.end();
  });

  it("queues pricing and usage side effects after completion", async () => {
    const started = await startVoiceCall({
      values: {
        businessId,
        twilioCallSid: providerCallSid,
        from: "+14165550120",
        to: "+14165550121",
        startedAt: "2030-01-01T10:00:00.000Z",
      },
      pool,
    });

    await completeVoiceCall({
      businessId,
      values: {
        callId: started.callId,
        status: "completed",
        endedAt: "2030-01-01T10:01:00.000Z",
        providerDurationSeconds: 60,
      },
      pool,
    });

    const outbox = await pool.query<{ topic: string; payload_json: unknown }>(
      `SELECT topic, payload_json
       FROM app.outbox_messages
       WHERE business_id = $1
       ORDER BY created_at ASC`,
      [businessId],
    );

    const topics = outbox.rows.map((row) => row.topic);
    expect(topics).toContain("call.completed");
    expect(topics).toContain("call.syncPrice");
    expect(topics).toContain("billing.recordUsage");
  });
});
