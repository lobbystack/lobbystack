import { hostBrand, parseDeploymentMode, readBrandingEnvironment, type Brand, type BrandLogoContentType, type EmailBrandReference } from "@lobbystack/shared";

import { getSavedBranding, getSavedBrandLogo } from "./branding";
import type { DomainContext } from "./context";

export type { Brand } from "@lobbystack/shared";

// Brands decide which brand a request or a business shows. Every hostname and
// every business gets the host brand until partners have brands of their own.
// Texts always use the host brand, so the SMS code calls deploymentAppName()
// and never this module.

// Long enough to spare the database a read on every page and email, short
// enough that another process soon shows what onboarding saved.
const BRAND_CACHE_MS = 30_000;

let cachedHostBrand: { promise: Promise<Brand>; expiresAt: number } | undefined;
let warnedInvalidEnvironment = false;

function warnOnInvalidEnvironment(environment: Record<string, string | undefined>): void {
  const { invalid } = readBrandingEnvironment(environment);
  if (!invalid.length || warnedInvalidEnvironment) return;
  warnedInvalidEnvironment = true;
  console.warn(`[branding] Ignoring ${invalid.join(" and ")}: a name must be 1 to 40 visible characters and a logo an https URL or a path starting with /.`);
}

/**
 * The host brand as the environment alone sets it, with no saved choice: what
 * a page built before the database could answer shows, and what pages and
 * emails fall back to when the database can't be read.
 */
export function hostBrandFromEnvironment(environment: Record<string, string | undefined> = process.env): Brand {
  warnOnInvalidEnvironment(environment);
  return hostBrand({ environment, saved: null });
}

async function readHostBrand(context: DomainContext): Promise<Brand> {
  const environment = process.env;
  warnOnInvalidEnvironment(environment);
  const fromEnvironment = readBrandingEnvironment(environment);
  // The database can't change a field the environment sets, and the cloud
  // never takes a saved choice (onboarding refuses it there).
  const skipsSaved = Boolean(fromEnvironment.appName && fromEnvironment.logoUrl) || parseDeploymentMode(environment.DEPLOYMENT_MODE) === "cloud";
  return hostBrand({ environment, saved: skipsSaved ? null : await getSavedBranding(context.db) });
}

/** The host brand, cached for the process. A failed read isn't cached, so the next caller tries again. */
async function loadHostBrand(context: DomainContext): Promise<Brand> {
  const now = Date.now();
  if (!cachedHostBrand || cachedHostBrand.expiresAt <= now) cachedHostBrand = { promise: readHostBrand(context), expiresAt: now + BRAND_CACHE_MS };
  const entry = cachedHostBrand;
  try {
    return await entry.promise;
  } catch (error) {
    if (cachedHostBrand === entry) cachedHostBrand = undefined;
    throw error;
  }
}

/**
 * The brand a request to this hostname shows, or null for a hostname no brand
 * answers for. Every hostname gets the host brand for now. Rejects when the
 * saved branding can't be read.
 */
export async function resolveHostBrand(context: DomainContext, host: string): Promise<Brand | null> {
  return await loadHostBrand(context);
}

/** The brand a business shows its operators and its emails: the host brand for every business for now. */
export async function brandForBusiness(context: DomainContext, businessId: string): Promise<Brand> {
  return await loadHostBrand(context);
}

/** Drops the cached brands, so the next read shows what was just saved. */
export function forgetCachedBrands(): void {
  cachedHostBrand = undefined;
}

/**
 * The saved logo a brand's logo URL points at, for the admin to serve, or null
 * when the brand has none saved. The host's is the one onboarding saved.
 */
export async function brandLogo(context: DomainContext, brand: Pick<Brand, "kind" | "partnerId">): Promise<{ bytes: Buffer; contentType: BrandLogoContentType; version: string } | null> {
  return await getSavedBrandLogo(context.db);
}

/**
 * The brand a queued email goes out under, read when it's sent: a business's
 * brand for an email about a business, and otherwise the brand of the request
 * that queued it. No brand is a partner's yet, so every reference gets the
 * host brand. Rejects when the brand can't be read.
 */
export async function brandForEmail(context: DomainContext, reference: EmailBrandReference): Promise<Brand> {
  return reference.kind === "business" ? await brandForBusiness(context, reference.businessId) : await loadHostBrand(context);
}
