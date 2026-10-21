import { NextResponse } from "next/server";

import { loadBranding } from "@/lib/branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The deployment's name and logo, for prerendered pages built before the database could say. */
export async function GET() {
  const branding = await loadBranding();
  return NextResponse.json({ appName: branding.appName, logoUrl: branding.logoUrl });
}
