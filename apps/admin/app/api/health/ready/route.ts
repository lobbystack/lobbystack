import { NextResponse } from "next/server";

import { databaseHealthCheck } from "@lobbystack/db";
import { createStorageProvider } from "@lobbystack/providers";
import { getAppDatabase } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [database, storage] = await Promise.all([
      databaseHealthCheck(getAppDatabase()),
      createStorageProvider().ensureReady().then(() => true).catch(() => false),
    ]);
    const ok = database.ok && storage;
    return NextResponse.json({ ok, service: "lobbystack-admin", checks: { database: database.ok ? "ok" : "failed", storage: storage ? "ok" : "failed" } }, { status: ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false, service: "lobbystack-admin", checks: { database: "failed", storage: "failed" } }, { status: 503 });
  }
}
