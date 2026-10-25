import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api-helpers";
import { loadRequestBrand } from "@/lib/branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The name and logo of the brand this hostname shows, for prerendered pages built before the database could say. */
export async function GET(request: Request) {
  const brand = await loadRequestBrand(request);
  if (!brand) return jsonError("Not found.", 404, "unknown_host");
  return NextResponse.json({ appName: brand.name, logoUrl: brand.logoUrl });
}
