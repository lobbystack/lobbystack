import { getSavedBranding } from "@lobbystack/domain";
import { parseDeploymentMode, readBrandingEnvironment, resolveBranding, type Branding, type BrandingEnvironment } from "@lobbystack/shared";

import { getAppDatabase } from "./api-helpers";
import type { BrandingSnapshot } from "./branding-snapshot";
import { reportServerError } from "./error-reporting";

// Long enough to spare the database a read on every page, short enough that
// another admin instance soon shows what onboarding saved.
const BRANDING_CACHE_MS = 30_000;
const FAILURE_REPORT_INTERVAL_MS = 60_000;

let cached: { promise: Promise<Branding>; expiresAt: number } | undefined;
let lastFailureReportAt = 0;
let warnedInvalidEnvironment = false;

function environmentBranding(environment: Record<string, string | undefined>): BrandingEnvironment {
  const branding = readBrandingEnvironment(environment);
  if (branding.invalid.length && !warnedInvalidEnvironment) {
    warnedInvalidEnvironment = true;
    console.warn(`[branding] Ignoring ${branding.invalid.join(" and ")}: a name must be 1 to 40 visible characters and a logo an https URL or a path starting with /.`);
  }
  return branding;
}

// The cloud never takes a saved choice (onboarding refuses it there), so only the environment counts.
function ignoresSavedBranding(environment: Record<string, string | undefined>): boolean {
  return parseDeploymentMode(environment.DEPLOYMENT_MODE) === "cloud";
}

async function readBranding(): Promise<Branding> {
  const environment = environmentBranding(process.env);
  // The database can't change a field the environment sets, so skip it when both are set.
  const saved = (environment.appName && environment.logoUrl) || ignoresSavedBranding(process.env) ? null : await getSavedBranding(getAppDatabase().db);
  return resolveBranding({ environment, saved });
}

/**
 * The deployment's name and logo: BRAND_APP_NAME and BRAND_LOGO_URL, then what
 * onboarding saved, then LobbyStack. When the database can't be read, pages
 * still render with the environment's choice.
 */
export async function loadBranding(): Promise<Branding> {
  const now = Date.now();
  if (!cached || cached.expiresAt <= now) cached = { promise: readBranding(), expiresAt: now + BRANDING_CACHE_MS };
  const entry = cached;
  try {
    return await entry.promise;
  } catch (error) {
    if (cached === entry) cached = undefined;
    if (now - lastFailureReportAt >= FAILURE_REPORT_INTERVAL_MS) {
      lastFailureReportAt = now;
      void reportServerError(error, { operation: "load_branding" });
    }
    return resolveBranding({ environment: environmentBranding(process.env), saved: null });
  }
}

/** Drops the cached branding, so the next page shows what was just saved. */
export function forgetCachedBranding(): void {
  cached = undefined;
}

export function brandingSnapshot(branding: Pick<Branding, "appName" | "logoUrl">): BrandingSnapshot {
  return { appName: branding.appName, logoUrl: branding.logoUrl, final: true };
}

/**
 * What a prerendered page can know when it's built: the environment's choice.
 * It's final when the environment sets both the name and the logo, or on the
 * cloud, which never reads a saved choice.
 */
export function buildTimeBrandingSnapshot(environment: Record<string, string | undefined> = process.env): BrandingSnapshot {
  const fromEnvironment = environmentBranding(environment);
  const branding = resolveBranding({ environment: fromEnvironment, saved: null });
  return { appName: branding.appName, logoUrl: branding.logoUrl, final: Boolean(fromEnvironment.appName && fromEnvironment.logoUrl) || ignoresSavedBranding(environment) };
}
