import { healthResponseSchema } from "@lobbystack/contracts";

import { jsonResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function GET() {
  return jsonResponse(
    healthResponseSchema.parse({
      status: "ok",
      service: "lobbystack-admin",
      version: process.env.npm_package_version ?? "0.1.0",
      checks: {},
    }),
  );
}
