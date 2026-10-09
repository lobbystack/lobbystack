import { NextResponse } from "next/server";

import { databaseHealthCheck } from "@lobbystack/db";
import { getAppDatabase } from "@/lib/api-helpers";
import { readyRedis } from "@/lib/redis";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [database, storage, redis] = await Promise.all([
      databaseHealthCheck(getAppDatabase()),
      getStorageProvider().ensureReady().then(() => true).catch(() => false),
      // Sessions and rate limits live in Redis. Like enforceFixedWindow, only a
      // non-production run may go without REDIS_URL.
      readyRedis().then((store) => {
        if (!store && process.env.NODE_ENV === "production") throw new Error("REDIS_URL is required.");
        return store?.ping();
      }).then(() => true, () => false),
    ]);
    const ok = database.ok && storage && redis;
    return NextResponse.json({ ok, service: "lobbystack-admin", checks: { database: database.ok ? "ok" : "failed", storage: storage ? "ok" : "failed", redis: redis ? "ok" : "failed" } }, { status: ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false, service: "lobbystack-admin", checks: { database: "failed", storage: "failed", redis: "failed" } }, { status: 503 });
  }
}
