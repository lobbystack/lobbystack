import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { brandForHostReference, forgetCachedBrands, hostBrandFromEnvironment } from "@lobbystack/domain";
import { HOST_EMAIL_BRAND, emailBrandReferenceFor, parseDeploymentMode, readBrandingEnvironment, type Brand, type EmailBrandReference } from "@lobbystack/shared";

import { listenForBrandChangesOnce, redisBrandChanges } from "./brand-changes";
import type { BrandingSnapshot } from "./branding-snapshot";
import { getDatabase } from "./databases";
import { reportServerError } from "./error-reporting";
import { readResolvedBrand, type ResolvedBrand } from "./request-brand";

const FAILURE_REPORT_INTERVAL_MS = 60_000;

let lastFailureReportAt = 0;

/**
 * The brand the proxy resolved a request to. When the database can't say,
 * the host's own domain falls back to the environment's host brand, and the
 * failure is reported at most once a minute. A partner's host has no such
 * fallback: the failure stands rather than showing the host brand there.
 */
async function brandFor(resolved: ResolvedBrand): Promise<Brand | null> {
  listenForBrandChangesOnce();
  try {
    return await brandForHostReference({ db: getDatabase("lobbystack_app").db }, resolved);
  } catch (error) {
    const now = Date.now();
    if (now - lastFailureReportAt >= FAILURE_REPORT_INTERVAL_MS) {
      lastFailureReportAt = now;
      void reportServerError(error, { operation: "load_branding" });
    }
    if (resolved.kind !== "host") throw error;
    return hostBrandFromEnvironment();
  }
}

/** A partner's brand by its id, for a page built for that partner rather than for a request, or null when the partner doesn't exist. */
export async function loadPartnerBrand(partnerId: string): Promise<Brand | null> {
  listenForBrandChangesOnce();
  return await brandForHostReference({ db: getDatabase("lobbystack_app").db }, { kind: "partner", partnerId });
}

/**
 * The brand of the request being answered, as the proxy resolved it from the
 * Host header and passed on, or null when it resolved none: the caller
 * answers that with a 404. Pass the request in a route handler; a server
 * component reads the header itself, so a prerendered page must pass its
 * branding instead of calling this.
 */
export async function loadRequestBrand(request?: Request): Promise<Brand | null> {
  const resolved = readResolvedBrand(request ? request.headers : await headers());
  return resolved ? await brandFor(resolved) : null;
}

/** The request's brand in a server component, which answers a request the proxy resolved no brand for with a 404. */
export async function requireRequestBrand(): Promise<Brand> {
  const brand = await loadRequestBrand();
  if (!brand) notFound();
  return brand;
}

/**
 * The brand reference for an email sent while answering a request, such as a
 * sign-up code: the brand the proxy resolved the request to. Outside a
 * request, as in a script, it's the host's.
 */
export async function loadRequestEmailBrand(): Promise<EmailBrandReference> {
  let requestHeaders: Headers;
  try {
    requestHeaders = await headers();
  } catch {
    return HOST_EMAIL_BRAND;
  }
  const resolved = readResolvedBrand(requestHeaders);
  if (!resolved) throw new Error("No brand answers for this hostname.");
  return emailBrandReferenceFor(resolved.kind === "partner" ? { kind: "partner", partnerId: resolved.partnerId } : { kind: "host", partnerId: null });
}

/** Drops the cached brands, so the next page shows what was just saved, and tells the other processes the host brand changed. */
export function forgetCachedBranding(): void {
  forgetCachedBrands();
  // Other processes show the save when their cache runs out if Redis can't take the message.
  void redisBrandChanges.publish({ kind: "host" }).catch(() => undefined);
}

/** What a page rendered for this brand starts with. A partner's page also carries the partner's icon, color and links. */
export function brandingSnapshot(brand: Pick<Brand, "kind" | "name" | "logoUrl" | "faviconUrl" | "color" | "links">): BrandingSnapshot {
  const snapshot: BrandingSnapshot = { appName: brand.name, logoUrl: brand.logoUrl, final: true };
  if (brand.kind !== "partner") return snapshot;
  const { terms, privacy, support } = brand.links;
  return { ...snapshot, partner: { faviconUrl: brand.faviconUrl, color: brand.color, links: { terms, privacy, support } } };
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
