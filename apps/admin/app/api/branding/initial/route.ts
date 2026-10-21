import { NextResponse } from "next/server";
import { saveInitialBranding } from "@lobbystack/domain";
import { MAX_BRAND_LOGO_BYTES, readBrandingEnvironment } from "@lobbystack/shared";

import { asApiResponse, getAppDatabase, jsonError, requireApiSession } from "@/lib/api-helpers";
import { forgetCachedBranding, loadBranding } from "@/lib/branding";
import { runtimeDeploymentMode } from "@/lib/deployment-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A logo at the size limit in base64, plus the name and the JSON around them.
const MAX_BODY_BYTES = Math.ceil(MAX_BRAND_LOGO_BYTES / 3) * 4 + 4096;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function tooLarge(): NextResponse {
  return jsonError("The logo must be 256 KB or smaller.", 413, "logo_too_large");
}

/** The JSON body, read no further than the limit so an oversized upload never fills memory. */
async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw jsonError("Invalid JSON body.", 400, "invalid_json");
  }
}

/**
 * Saves the name and logo the deployment's first owner chose in onboarding:
 * `{ appName, logo }`, the logo in base64. Leaving both out keeps LobbyStack
 * and ends the choice. A field the environment sets is not theirs to choose,
 * and LobbyStack's own cloud keeps its brand.
 */
export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    if (runtimeDeploymentMode() === "cloud") throw jsonError("This deployment's name and logo can't be chosen here.", 403, "branding_not_allowed");
    const body = await readBody(request);
    const fields = body && typeof body === "object" && !Array.isArray(body) ? body as { appName?: unknown; logo?: unknown } : null;
    const appName = fields?.appName ?? null;
    const logo = fields?.logo ?? null;
    if (!fields || (appName !== null && typeof appName !== "string") || (logo !== null && (typeof logo !== "string" || !BASE64.test(logo)))) {
      throw jsonError("Send the name as text and the logo as base64.", 400, "invalid_branding");
    }
    const environment = readBrandingEnvironment(process.env);
    await saveInitialBranding({ db: getAppDatabase().db }, {
      userId: session.user.id,
      appName: environment.appName ? null : appName,
      logo: environment.logoUrl || !logo ? null : Buffer.from(logo, "base64"),
    });
    forgetCachedBranding();
    const branding = await loadBranding();
    return NextResponse.json({ appName: branding.appName, logoUrl: branding.logoUrl });
  } catch (error) {
    return asApiResponse(error);
  }
}
