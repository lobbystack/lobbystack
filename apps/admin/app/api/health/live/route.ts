import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, service: "lobbystack-admin", version: process.env.SERVICE_VERSION ?? "development" });
}
