import type { Pool, PoolClient } from "pg";

export type ActorType = "user" | "worker" | "system" | "dispatcher" | "auth";

export type RlsContext = {
  businessId: string;
  userId?: string | undefined;
  actorType: ActorType;
};

export async function setRlsContext(
  client: PoolClient,
  context: RlsContext,
): Promise<void> {
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [
    context.userId ?? "",
  ]);
  await client.query(`SELECT set_config('app.business_id', $1, true)`, [
    context.businessId,
  ]);
  await client.query(`SELECT set_config('app.actor_type', $1, true)`, [
    context.actorType,
  ]);
}

export async function withBusinessTransaction<T>(
  pool: Pool,
  context: RlsContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await setRlsContext(client, context);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withReadonlyContext<T>(
  pool: Pool,
  context: RlsContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN READ ONLY");
    await setRlsContext(client, context);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function currentRlsContext(
  client: PoolClient,
): Promise<Record<string, string | null>> {
  const result = await client.query<{
    user_id: string | null;
    business_id: string | null;
    actor_type: string | null;
  }>(
    `SELECT
      current_setting('app.user_id', true) AS user_id,
      current_setting('app.business_id', true) AS business_id,
      current_setting('app.actor_type', true) AS actor_type`,
  );

  const row = result.rows[0];
  return {
    userId: row?.user_id ?? null,
    businessId: row?.business_id ?? null,
    actorType: row?.actor_type ?? null,
  };
}
