import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getPartnerBrandSettings, savePartnerBrand } from "@lobbystack/domain";
import { MAX_BRAND_LOGO_BYTES } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";
import { partnerSitePages } from "@/lib/partner-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The partner console's Branding & domain page. Saving goes through a partner
// operation, which checks the actor's role itself and tells every process,
// then marks the partner's public pages to render again.

// A logo and a favicon at the size limit in base64, plus the text fields and the JSON around them.
const MAX_BODY_BYTES = 2 * Math.ceil(MAX_BRAND_LOGO_BYTES / 3) * 4 + 16 * 1024;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const TEXT_FIELDS = ["color", "termsUrl", "privacyUrl", "supportUrl", "supportEmail"] as const;

class InvalidBrand extends Error {}

/** A text field: a string, or null when it's left empty. */
function text(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new InvalidBrand(`${field} must be text.`);
  return value;
}

/** An image field: left out to keep the saved image, null to remove it, or the new image in base64. */
function image(body: Record<string, unknown>, field: "logo" | "favicon"): Uint8Array | null | undefined {
  const value = body[field];
  if (value === undefined || value === null) return value;
  if (typeof value !== "string" || !BASE64.test(value)) throw new InvalidBrand(`Send the ${field} in base64.`);
  return Buffer.from(value, "base64");
}

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json(await getPartnerBrandSettings(domain, actor)));

/** Saves `{ name, color, termsUrl, privacyUrl, supportUrl, supportEmail, logo?, favicon? }`. */
export const PUT = partnerRoute(async ({ actor, body, domain, partnerId }) => {
  if (typeof body.name !== "string" || !body.name.trim()) return jsonError("name is required.", 400, "invalid_name");
  let fields: Record<(typeof TEXT_FIELDS)[number], string | null>;
  let logo: Uint8Array | null | undefined;
  let favicon: Uint8Array | null | undefined;
  try {
    fields = Object.fromEntries(TEXT_FIELDS.map((field) => [field, text(body, field)])) as typeof fields;
    logo = image(body, "logo");
    favicon = image(body, "favicon");
  } catch (error) {
    if (error instanceof InvalidBrand) return jsonError(error.message, 400, "invalid_branding");
    throw error;
  }
  const saved = await savePartnerBrand(domain, actor, {
    name: body.name,
    ...fields,
    ...(logo === undefined ? {} : { logo }),
    ...(favicon === undefined ? {} : { favicon }),
  });
  // This process renders each page again on its next visit; every other one once its copy's cache window passes.
  for (const page of partnerSitePages(partnerId)) revalidatePath(page);
  return NextResponse.json(saved);
}, { maxBodyBytes: MAX_BODY_BYTES });
