import { NextResponse } from "next/server";

import { databaseHealthCheck } from "@lobbystack/db";
import { getAppDatabase } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await databaseHealthCheck(getAppDatabase());
    const ok = database.ok;
    return NextResponse.json({ ok, service: "lobbystack-admin", checks: { database: ok ? "ok" : "failed" } }, { status: ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false, service: "lobbystack-admin", checks: { database: "failed" } }, { status: 503 });
  }
}
