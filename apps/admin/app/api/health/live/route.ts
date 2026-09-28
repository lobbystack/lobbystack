import { NextResponse } from "next/server";

import { releaseVersion } from "@/lib/release-version";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, service: "lobbystack-admin", version: releaseVersion() });
}
