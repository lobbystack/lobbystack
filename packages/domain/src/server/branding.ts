import { sql } from "drizzle-orm";
import {
  MAX_BRAND_LOGO_BYTES,
  brandLogoContentType,
  normalizeAppName,
  readBrandingEnvironment,
  resolveBranding,
  type BrandLogoContentType,
  type SavedBranding,
} from "@lobbystack/shared";

import { deploymentBranding, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";

function brandingError(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

/** What the deployment's first owner saved, or null while nobody has. */
export async function getSavedBranding(db: Database | DatabaseTransaction): Promise<SavedBranding | null> {
  const [row] = await db
    .select({ appName: deploymentBranding.appName, logoVersion: deploymentBranding.logoVersion })
    .from(deploymentBranding)
    .limit(1);
  return row ?? null;
}

/**
 * The name the deployment gives itself in text it sends, such as SMS replies:
 * BRAND_APP_NAME, then what onboarding saved, then LobbyStack. The database
 * isn't read when the environment sets the name.
 */
export async function deploymentAppName(db: Database | DatabaseTransaction, environment: Record<string, string | undefined> = process.env): Promise<string> {
  const fromEnvironment = readBrandingEnvironment(environment);
  const saved = fromEnvironment.appName ? null : await getSavedBranding(db);
  return resolveBranding({ environment: fromEnvironment, saved }).appName;
}

/** The saved logo's bytes, for the admin to serve. */
export async function getSavedBrandLogo(db: Database): Promise<{ bytes: Buffer; contentType: BrandLogoContentType; version: string } | null> {
  const [row] = await db
    .select({ logo: deploymentBranding.logo, contentType: deploymentBranding.logoContentType, version: deploymentBranding.logoVersion })
    .from(deploymentBranding)
    .limit(1);
  if (!row?.logo || !row.contentType || !row.version) return null;
  return { bytes: row.logo, contentType: row.contentType as BrandLogoContentType, version: row.version };
}

/**
 * Whether this person may still choose the deployment's name and logo: nobody
 * has, and they own every business on the deployment. On a fresh
 * deployment there are no businesses, so the first person to sign up may.
 */
export async function canSaveInitialBranding(context: DomainContext, input: { userId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async (tx) => {
    const result = await tx.execute<{ allowed: boolean }>(sql`select app.can_save_initial_branding() as allowed`);
    return result.rows[0]?.allowed === true;
  });
}

/**
 * Saves the deployment's name and logo, once. A missing field stays on the
 * default, so saving neither keeps LobbyStack and still ends the choice.
 */
export async function saveInitialBranding(
  context: DomainContext,
  input: { userId: string; appName?: string | null; logo?: Uint8Array | null },
): Promise<void> {
  const typedName = input.appName?.trim() ? input.appName : null;
  const appName = typedName === null ? null : normalizeAppName(typedName);
  if (typedName !== null && appName === null) {
    throw brandingError("Choose a name of 40 characters or fewer.", 400, "invalid_app_name");
  }
  const logo = input.logo?.length ? input.logo : null;
  if (logo && logo.length > MAX_BRAND_LOGO_BYTES) {
    throw brandingError("The logo must be 256 KB or smaller.", 413, "logo_too_large");
  }
  const logoContentType = logo ? brandLogoContentType(logo) : null;
  if (logo && !logoContentType) {
    throw brandingError("Upload a PNG, JPEG, WebP or SVG image.", 400, "invalid_logo");
  }
  const outcome = await withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async (tx) => {
    const result = await tx.execute<{ outcome: string }>(sql`
      select app.save_initial_branding(${appName}::text, ${logo ? Buffer.from(logo) : null}::bytea, ${logoContentType}::text) as outcome
    `);
    return result.rows[0]?.outcome;
  });
  if (outcome === "already_saved") {
    throw brandingError("This deployment's name and logo were already chosen.", 409, "branding_already_saved");
  }
  if (outcome !== "saved") {
    throw brandingError("Only the deployment's first owner can choose its name and logo.", 403, "branding_not_allowed");
  }
}
