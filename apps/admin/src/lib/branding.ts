import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { forgetCachedBrands, hostBrandFromEnvironment, resolveHostBrand } from "@lobbystack/domain";
import { HOST_EMAIL_BRAND, emailBrandReferenceFor, parseDeploymentMode, readBrandingEnvironment, type Brand, type EmailBrandReference } from "@lobbystack/shared";

import type { BrandingSnapshot } from "./branding-snapshot";
import { getDatabase } from "./databases";
import { reportServerError } from "./error-reporting";

const FAILURE_REPORT_INTERVAL_MS = 60_000;

let lastFailureReportAt = 0;

/**
 * The brand this hostname shows, or null when no brand answers for it. When
 * the database can't say, the environment's host brand stands in, and the
 * failure is reported at most once a minute.
 */
async function brandForHost(host: string): Promise<Brand | null> {
  try {
    return await resolveHostBrand({ db: getDatabase("lobbystack_app").db }, host);
  } catch (error) {
    const now = Date.now();
    if (now - lastFailureReportAt >= FAILURE_REPORT_INTERVAL_MS) {
      lastFailureReportAt = now;
      void reportServerError(error, { operation: "load_branding" });
    }
    return hostBrandFromEnvironment();
  }
}

/**
 * The brand of the request being answered, from its Host header, or null for
 * a hostname no brand answers for: the caller answers that with a 404. The
 * admin runs as a standalone server, so a route's request.url carries the
 * address it listens on rather than the one the visitor used. Pass the
 * request in a route handler; a server component reads the header itself, so
 * a prerendered page must pass its branding instead of calling this.
 */
export async function loadRequestBrand(request?: Request): Promise<Brand | null> {
  const host = (request ? request.headers : await headers()).get("host") ?? "";
  return await brandForHost(host);
}

/** The request's brand in a server component, which answers a hostname no brand answers for with a 404. */
export async function requireRequestBrand(): Promise<Brand> {
  const brand = await loadRequestBrand();
  if (!brand) notFound();
  return brand;
}

/**
 * The brand reference for an email sent while answering a request, such as a
 * sign-up code: the request's brand. Outside a request, as in a script, it's
 * the host's.
 */
export async function loadRequestEmailBrand(): Promise<EmailBrandReference> {
  let host: string;
  try {
    host = (await headers()).get("host") ?? "";
  } catch {
    return HOST_EMAIL_BRAND;
  }
  const brand = await brandForHost(host);
  if (!brand) throw new Error("No brand answers for this hostname.");
  return emailBrandReferenceFor(brand);
}

/** Drops the cached brands, so the next page shows what was just saved. */
export function forgetCachedBranding(): void {
  forgetCachedBrands();
}

export function brandingSnapshot(brand: Pick<Brand, "name" | "logoUrl">): BrandingSnapshot {
  return { appName: brand.name, logoUrl: brand.logoUrl, final: true };
}

/**
 * What a prerendered page can know when it's built: the environment's choice.
 * It's final when the environment sets both the name and the logo, or on the
 * cloud, which never reads a saved choice.
 */
export function buildTimeBrandingSnapshot(environment: Record<string, string | undefined> = process.env): BrandingSnapshot {
  const brand = hostBrandFromEnvironment(environment);
  const fromEnvironment = readBrandingEnvironment(environment);
  const final = Boolean(fromEnvironment.appName && fromEnvironment.logoUrl) || parseDeploymentMode(environment.DEPLOYMENT_MODE) === "cloud";
  return { appName: brand.name, logoUrl: brand.logoUrl, final };
}
