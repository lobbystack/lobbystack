import { healthResponseSchema } from "@lobbystack/contracts";
import { pools } from "@lobbystack/db";

import { jsonResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, "ok" | "degraded" | "failed"> = {
    database: "ok",
  };

  try {
    await pools.readonly().query("SELECT 1");
  } catch {
    checks.database = "failed";
  }

  const status = Object.values(checks).every((value) => value === "ok") ? "ok" : "degraded";

  return jsonResponse(
    healthResponseSchema.parse({
      status,
      service: "lobbystack-admin",
      version: process.env.npm_package_version ?? "0.1.0",
      checks,
    }),
    { status: status === "ok" ? 200 : 503 },
  );
}
