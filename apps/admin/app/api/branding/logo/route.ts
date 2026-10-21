import { getSavedBrandLogo } from "@lobbystack/domain";

import { asApiResponse, getAppDatabase } from "@/lib/api-helpers";
import { BRAND_LOGO_SECURITY_HEADERS } from "../../../../security-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The logo the deployment's first owner uploaded in onboarding. The URL pages
 * use carries the logo's digest, so a browser may keep that response for good.
 */
export async function GET(request: Request) {
  let logo: Awaited<ReturnType<typeof getSavedBrandLogo>>;
  try {
    logo = await getSavedBrandLogo(getAppDatabase().db);
  } catch (error) {
    const response = asApiResponse(error);
    response.headers.set("cache-control", "no-store");
    return response;
  }
  if (!logo) return new Response(null, { status: 404, headers: { ...BRAND_LOGO_SECURITY_HEADERS, "cache-control": "no-store" } });
  const etag = `"${logo.version}"`;
  const headers = {
    ...BRAND_LOGO_SECURITY_HEADERS,
    "cache-control": new URL(request.url).searchParams.get("v") === logo.version ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    "content-type": logo.contentType,
    etag,
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(logo.bytes), { headers });
}
