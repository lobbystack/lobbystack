import { sql } from "drizzle-orm";

import {
  currentPartnerSubdomain,
  hostBrand,
  isHostDomain,
  normalizeHostname,
  parseDeploymentMode,
  partnerBrand,
  partnerFeatures,
  readBrandingEnvironment,
  type Brand,
  type BrandImage,
  type BrandLogoContentType,
  type EmailBrandReference,
  type PartnerBrandRecord,
} from "@lobbystack/shared";

import { getSavedBranding, getSavedBrandLogo } from "./branding";
import type { DomainContext } from "./context";

export type { Brand } from "@lobbystack/shared";

// Brands decide which brand a request, a business or an email shows: the
// host brand on the host's own domain and for direct businesses, a partner's
// brand on its domains and for its businesses, and no brand for any other
// hostname. Texts always use the host brand, so the SMS code calls
// deploymentAppName() and never this module.

// Long enough to spare the database a read on every page and email, short
// enough that a process that missed a change soon shows it anyway. A brand
// change also clears every process's cache at once through a Redis message.
const BRAND_CACHE_MS = 30_000;

// Hostnames no brand answers for are cached too, so a run of made-up
// subdomains of the partner base domain costs one database read each per
// window; other hostnames no partner can have cost none. The caches keep at
// most this many entries each, dropping the oldest first.
const MAX_CACHED_ENTRIES = 1_000;

type Cached<T> = { promise: Promise<T>; expiresAt: number };

let cachedHostBrand: Cached<Brand> | undefined;
/** Hostname to the partner it belongs to, or null for a hostname no partner has. */
const cachedHosts = new Map<string, Cached<string | null>>();
/** Partner id to its saved brand, or null for a partner that doesn't exist. */
const cachedPartners = new Map<string, Cached<PartnerBrandRecord | null>>();
let warnedInvalidEnvironment = false;

/** The cached answer for a key, or a fresh read that later callers share. A failed read isn't cached, so the next caller tries again. */
function remember<T>(cache: Map<string, Cached<T>>, key: string, read: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const found = cache.get(key);
  if (found && found.expiresAt > now) return found.promise;
  const entry: Cached<T> = { promise: read(), expiresAt: now + BRAND_CACHE_MS };
  cache.delete(key);
  cache.set(key, entry);
  for (const oldest of cache.keys()) {
    if (cache.size <= MAX_CACHED_ENTRIES) break;
    cache.delete(oldest);
  }
  entry.promise.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
  return entry.promise;
}

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

type PartnerBrandRow = {
  name: string;
  subdomain: string | null;
  logo_version: string | null;
  favicon_version: string | null;
  brand_color: string | null;
  terms_url: string | null;
  privacy_url: string | null;
  support_url: string | null;
  support_email: string | null;
  custom_domain?: string | null;
  logo_content_type?: string | null;
};

// Visitors and the worker have no partner membership, so they read the partner through this function.
async function readPartnerBrand(context: DomainContext, partnerId: string): Promise<PartnerBrandRecord | null> {
  const row = (await context.db.execute<PartnerBrandRow>(sql`select * from app.partner_brand(${partnerId}::uuid)`)).rows[0];
  if (!row) return null;
  return {
    partnerId,
    name: row.name,
    subdomain: row.subdomain ?? null,
    customDomain: row.custom_domain ?? null,
    logoVersion: row.logo_version ?? null,
    logoContentType: row.logo_content_type ?? null,
    faviconVersion: row.favicon_version ?? null,
    color: row.brand_color ?? null,
    termsUrl: row.terms_url ?? null,
    privacyUrl: row.privacy_url ?? null,
    supportUrl: row.support_url ?? null,
    supportEmail: row.support_email ?? null,
  };
}

/** A partner's brand, cached for the process, or null for a partner that doesn't exist. */
async function loadPartnerBrand(context: DomainContext, partnerId: string): Promise<Brand | null> {
  const partner = await remember(cachedPartners, partnerId.toLowerCase(), () => readPartnerBrand(context, partnerId));
  return partner && partnerBrand({ environment: process.env, partner });
}

/**
 * The partner a hostname belongs to: a verified domain row, where a subdomain
 * counts only while it's directly under the current partner base domain.
 */
async function readHostPartner(context: DomainContext, hostname: string): Promise<string | null> {
  const row = (await context.db.execute<{ partner_id: string; kind: string }>(sql`select partner_id, kind from app.partner_for_host(${hostname})`)).rows[0];
  if (!row) return null;
  if (row.kind === "subdomain" && !currentPartnerSubdomain(hostname, process.env)) return null;
  return row.partner_id;
}

/**
 * Whether a hostname that isn't the host's could be a partner's: a subdomain
 * directly under the current partner base domain, or any hostname while this
 * deployment issues certificates for partners' own domains. No partner has
 * any other hostname, so a health check on 127.0.0.1 or a run of made-up
 * hostnames never reaches the database.
 */
function mayBelongToPartner(hostname: string): boolean {
  return currentPartnerSubdomain(hostname, process.env) !== null || partnerFeatures(process.env).customDomains !== null;
}

/** Whether a Host header names the host's own domain, which gets the host brand whatever the database says. */
export function isHostDomainHost(host: string): boolean {
  const hostname = normalizeHostname(host);
  return hostname !== null && isHostDomain(hostname, process.env);
}

/**
 * The brand a request to this Host header shows: the host brand on the host's
 * own domain, a partner's brand on its subdomain of the partner base domain
 * or another verified domain of its own, and null for any other hostname,
 * which the caller answers with a 404. Case, a trailing dot and the port
 * don't matter. Only a hostname that could be a partner's is looked up, and
 * that lookup rejects when the database can't be read.
 */
export async function resolveHostBrand(context: DomainContext, host: string): Promise<Brand | null> {
  const hostname = normalizeHostname(host);
  if (!hostname) return null;
  if (isHostDomain(hostname, process.env)) return await loadHostBrand(context);
  if (!mayBelongToPartner(hostname)) return null;
  const partnerId = await remember(cachedHosts, hostname, () => readHostPartner(context, hostname));
  return partnerId ? await loadPartnerBrand(context, partnerId) : null;
}

/** A host the proxy already resolved: the host's own domain, or a partner's. */
export type HostBrandReference = { kind: "host" } | { kind: "partner"; partnerId: string };

/**
 * The brand behind a host the proxy already resolved, from the cache: the
 * host brand, or the partner's brand, or null for a partner that no longer
 * exists. Pages and routes call this with what the proxy passed on rather
 * than resolving the Host header again. Rejects when the database can't be
 * read.
 */
export async function brandForHostReference(context: DomainContext, reference: HostBrandReference): Promise<Brand | null> {
  if (reference.kind === "partner") return await loadPartnerBrand(context, reference.partnerId);
  return await loadHostBrand(context);
}

/**
 * The brand a business shows its operators and its emails: its partner's for a
 * partner's business, and the host's for a direct one. Rejects for a partner
 * it can't find, so an email waits rather than going out under the host brand.
 */
export async function brandForBusiness(context: DomainContext, businessId: string): Promise<Brand> {
  // The worker has no business in its context when it sends an email, so it reads the partner through this function.
  const partnerId = (await context.db.execute<{ partner_id: string | null }>(sql`select app.business_partner(${businessId}::uuid) as partner_id`)).rows[0]?.partner_id ?? null;
  if (!partnerId) return await loadHostBrand(context);
  const brand = await loadPartnerBrand(context, partnerId);
  if (!brand) throw new Error(`Partner ${partnerId} was not found for its business's brand.`);
  return brand;
}

/** What changed: the host's brand, or a partner's brand or domains. */
export type BrandChange = { kind: "host" } | { kind: "partner"; partnerId: string };

/** Tells every other process that a brand changed. The admin passes one built on its Redis client. */
export type BrandChangePublisher = { publish(change: BrandChange): Promise<void> };

/** The Redis connection a process listens for brand changes on. A connection in this mode runs nothing else. */
export type BrandChangeSubscriber = {
  status?: string;
  subscribe(channel: string): Promise<unknown>;
  on(event: "message", listener: (channel: string, message: string) => void): unknown;
  on(event: "ready", listener: () => void): unknown;
};

/** The Redis channel brand changes go out on, under the deployment's Redis prefix. */
export function brandChangesChannel(prefix = process.env.REDIS_PREFIX ?? "lobbystack"): string {
  return `${prefix}:brand-changes`;
}

export function encodeBrandChange(change: BrandChange): string {
  return JSON.stringify(change);
}

/**
 * Drops cached brands, so the next read shows what was just saved: all of
 * them, or what one change touches. A partner's change also drops every
 * cached hostname, since a domain may have moved to it or away.
 */
export function forgetCachedBrands(change?: BrandChange): void {
  if (change?.kind === "partner") {
    cachedPartners.delete(change.partnerId.toLowerCase());
    cachedHosts.clear();
    return;
  }
  if (change?.kind === "host") {
    cachedHostBrand = undefined;
    return;
  }
  cachedHostBrand = undefined;
  cachedHosts.clear();
  cachedPartners.clear();
}

/** Applies a message from the brand changes channel. One it can't read drops everything rather than nothing. */
export function applyBrandChangeMessage(message: string): void {
  let change: unknown;
  try {
    change = JSON.parse(message);
  } catch {
    change = null;
  }
  const { kind, partnerId } = (change && typeof change === "object" ? change : {}) as { kind?: unknown; partnerId?: unknown };
  if (kind === "host") forgetCachedBrands({ kind });
  else if (kind === "partner" && typeof partnerId === "string" && partnerId) forgetCachedBrands({ kind, partnerId });
  else forgetCachedBrands();
}

/**
 * Clears this process's cached brands whenever any process announces a
 * change, through the subscriber given. Pub/Sub keeps no backlog, so after the
 * connection comes back the process drops everything it cached, since it may
 * have missed a change meanwhile.
 */
export async function listenForBrandChanges(subscriber: BrandChangeSubscriber, channel = brandChangesChannel()): Promise<void> {
  let connected = subscriber.status === "ready";
  subscriber.on("ready", () => {
    if (connected) forgetCachedBrands();
    connected = true;
  });
  subscriber.on("message", (name, message) => { if (name === channel) applyBrandChangeMessage(message); });
  await subscriber.subscribe(channel);
}

/**
 * Clears this process's cache for a change that was just saved, and tells
 * every other process. A failed announcement doesn't undo the save: other
 * processes show it once their cache expires.
 */
export async function announceBrandChange(context: DomainContext, change: BrandChange): Promise<void> {
  forgetCachedBrands(change);
  try {
    await context.brandChanges?.publish(change);
  } catch (error) {
    console.warn("[branding] Other processes show the brand change once their cache expires: it couldn't be announced.", error instanceof Error ? error.message : error);
  }
}

/**
 * A brand's saved logo or favicon, for the admin to serve, or null when it has
 * none saved. The host's is the logo onboarding saved, which is also its
 * favicon; a partner's are the ones it saved on the Branding & domain page.
 */
export async function brandLogo(context: DomainContext, brand: Pick<Brand, "kind" | "partnerId">, image: BrandImage = "logo"): Promise<{ bytes: Buffer; contentType: BrandLogoContentType; version: string } | null> {
  if (brand.kind !== "partner" || !brand.partnerId) return await getSavedBrandLogo(context.db);
  const row = (await context.db.execute<{ image: Buffer | null; content_type: string | null; version: string | null }>(sql`select image, content_type, version from app.partner_brand_image(${brand.partnerId}::uuid, ${image})`)).rows[0];
  if (!row?.image || !row.content_type || !row.version) return null;
  return { bytes: row.image, contentType: row.content_type as BrandLogoContentType, version: row.version };
}

/**
 * The brand a queued email goes out under, read when it's sent: a business's
 * brand for an email about a business, a partner's for the partner's own
 * emails, and the host's otherwise. Rejects when the brand can't be read or
 * the partner can't be found, so the email waits.
 */
export async function brandForEmail(context: DomainContext, reference: EmailBrandReference): Promise<Brand> {
  if (reference.kind === "business") return await brandForBusiness(context, reference.businessId);
  if (reference.kind === "partner") {
    const brand = await loadPartnerBrand(context, reference.partnerId);
    if (!brand) throw new Error(`Partner ${reference.partnerId} was not found for its email brand.`);
    return brand;
  }
  return await loadHostBrand(context);
}
