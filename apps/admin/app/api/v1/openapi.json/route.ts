import { NextResponse } from "next/server";

import { buildOpenApiDocument } from "@lobbystack/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, unauthenticated: the v1 OpenAPI 3.1 document generated from the zod schemas. */
export function GET(request: Request) {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  const origin = configured || new URL(request.url).origin;
  return NextResponse.json(buildOpenApiDocument({ serverUrl: `${origin}/api/v1` }), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
