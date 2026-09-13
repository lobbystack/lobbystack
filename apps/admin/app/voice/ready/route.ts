import { NextResponse } from "next/server";

import { databaseHealthCheck } from "@lobbystack/db";
import { createStorageProvider } from "@lobbystack/providers";
import { isMaintenanceMode } from "@lobbystack/shared";
import { asApiResponse, getAppDatabase, requireInternalService } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireInternalService(request, "");
    if (isMaintenanceMode(process.env)) {
      return NextResponse.json({ ok: false, service: "lobbystack-voice", readiness: "unavailable" }, { status: 503 });
    }

    const [database, storage] = await Promise.all([
      databaseHealthCheck(getAppDatabase()),
      createStorageProvider().ensureReady().then(() => true).catch(() => false),
    ]);
    const ok = database.ok && storage;
    return NextResponse.json(
      { ok, service: "lobbystack-voice", readiness: ok ? "ready" : "unavailable" },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    return asApiResponse(error);
  }
}
