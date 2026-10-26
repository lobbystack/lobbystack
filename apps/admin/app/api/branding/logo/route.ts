import { brandLogo } from "@lobbystack/domain";
import { isUuid, type Brand, type BrandImage } from "@lobbystack/shared";

import { asApiResponse, getAppDatabase } from "@/lib/api-helpers";
import { loadRequestBrand } from "@/lib/branding";
import { BRAND_LOGO_SECURITY_HEADERS } from "../../../../security-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response(null, { status: 404, headers: { ...BRAND_LOGO_SECURITY_HEADERS, "cache-control": "no-store" } });
}

/**
 * A saved brand image. With ?partner=, that partner's logo, or its favicon
 * with &image=favicon: they show on its sign-in pages, in its emails and in
 * its console, so anyone may load them. Without it, the logo of the brand
 * this hostname shows: for the host, the one the deployment's first owner
 * uploaded in onboarding. The URLs pages use carry the image's digest, so a
 * browser may keep that response for good.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const partnerId = query.get("partner");
  const image: BrandImage = query.get("image") === "favicon" ? "favicon" : "logo";
  if (partnerId !== null && !isUuid(partnerId)) return notFound();
  let logo: Awaited<ReturnType<typeof brandLogo>>;
  try {
    const brand: Pick<Brand, "kind" | "partnerId"> | null = partnerId ? { kind: "partner", partnerId } : await loadRequestBrand(request);
    logo = brand && await brandLogo({ db: getAppDatabase().db }, brand, image);
  } catch (error) {
    const response = asApiResponse(error);
    response.headers.set("cache-control", "no-store");
    return response;
  }
  if (!logo) return notFound();
  const etag = `"${logo.version}"`;
  const headers = {
    ...BRAND_LOGO_SECURITY_HEADERS,
    "cache-control": query.get("v") === logo.version ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    "content-type": logo.contentType,
    etag,
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(logo.bytes), { headers });
}
