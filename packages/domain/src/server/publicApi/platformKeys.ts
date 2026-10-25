import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { businesses, platformKeyBusinesses, withBusinessTransaction } from "@lobbystack/db";
import { PLATFORM_API_KEY_PREFIX, apiKeyScopes, businessApiKeyScopes, type ApiKeyScope, type PlatformOnlyScope } from "@lobbystack/shared";

import type { DomainContext } from "../context";
import { notFound } from "./errors";

// Platform keys onboard and manage businesses for the host. They are set in
// the admin's PLATFORM_API_KEYS environment variable as a JSON array, never in
// the database, so no dashboard user can create one. Each entry keeps the
// SHA-256 of its key, not the key. A key carries 192 random bits, so a pepper
// or a slow hash would add nothing, and the hashes stay valid when
// ENCRYPTION_KEY changes. Keys look like lsp_<8 hex id>_<32 url-safe
// characters>; `pnpm platform-key:create` makes one and prints its entry.
//
// Each entry names its group, and a key with group access reaches the
// businesses its group's keys created. Entries made before ADR 0010 call the
// group `partner` and the access `partner`; both still work.

const KEY_PATTERN = /^lsp_[0-9a-f]{8}_[A-Za-z0-9_-]{32}$/;
const PREFIX_LENGTH = PLATFORM_API_KEY_PREFIX.length + 8;

export type PlatformKeyAccess = "group" | "all";

const groupSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Use 1 to 40 lowercase letters, digits or hyphens.");

const entrySchema = z.strictObject({
  id: z.uuid(),
  prefix: z.string().regex(/^lsp_[0-9a-f]{8}$/, "Use the prefix printed with the key, lsp_ and 8 hex characters."),
  hash: z.string().regex(/^[0-9a-f]{64}$/, "Use the 64-character SHA-256 hex printed with the key."),
  name: z.string().trim().min(1).max(120),
  // partner is the old name for group. An entry sets exactly one of them,
  // which parsePlatformKeys checks.
  group: groupSlug.optional(),
  partner: groupSlug.optional(),
  owner_email: z.email(),
  // "partner" is the old name for "group".
  access: z.enum(["group", "all", "partner"]).default("group"),
  // Required, so a key never gains a scope added after it was made.
  scopes: z.array(z.enum(apiKeyScopes)).min(1),
  created_at: z.iso.datetime({ offset: true }),
});

/** One PLATFORM_API_KEYS entry, as written in the environment variable. */
export type PlatformKeyEntry = z.input<typeof entrySchema>;

/** A platform key a request presented, without its hash. */
export type ResolvedPlatformKey = {
  platformKeyId: string;
  prefix: string;
  name: string;
  /** The group the key belongs to. Audit rows and request logs carry it. */
  group: string;
  /** The LobbyStack account the key acts as. */
  ownerEmail: string;
  access: PlatformKeyAccess;
  scopes: ApiKeyScope[];
  createdAt: string;
};

type PlatformKey = ResolvedPlatformKey & { hash: string };

export class PlatformKeyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformKeyConfigError";
  }
}

export function hashPlatformKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isPlatformKeyToken(value: string): boolean {
  return value.startsWith(PLATFORM_API_KEY_PREFIX);
}

export function isWellFormedPlatformKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/**
 * Reads PLATFORM_API_KEYS. An empty or unset value means no platform keys.
 * Anything malformed throws, naming the entry and field but never a value, so
 * a bad deployment refuses every platform key instead of guessing.
 */
export function parsePlatformKeys(raw: string | undefined): PlatformKey[] {
  const text = raw?.trim();
  if (!text) return [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PlatformKeyConfigError("PLATFORM_API_KEYS is not valid JSON.");
  }
  if (!Array.isArray(value)) throw new PlatformKeyConfigError("PLATFORM_API_KEYS must be a JSON array of key entries.");
  const keys = value.map((item, index): PlatformKey => {
    const parsed = entrySchema.safeParse(item);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "entry"))];
      throw new PlatformKeyConfigError(`PLATFORM_API_KEYS entry ${index} is invalid: check ${fields.join(", ")}.`);
    }
    const entry = parsed.data;
    if (entry.group !== undefined && entry.partner !== undefined) throw new PlatformKeyConfigError(`PLATFORM_API_KEYS entry ${index} sets both group and partner, the old name for group. Remove partner.`);
    const group = entry.group ?? entry.partner;
    if (group === undefined) throw new PlatformKeyConfigError(`PLATFORM_API_KEYS entry ${index} is invalid: check group.`);
    return {
      platformKeyId: entry.id,
      prefix: entry.prefix,
      hash: entry.hash,
      name: entry.name,
      group,
      ownerEmail: entry.owner_email,
      access: entry.access === "all" ? "all" : "group",
      // Canonical order, like per-business keys.
      scopes: apiKeyScopes.filter((scope) => entry.scopes.includes(scope)),
      createdAt: new Date(entry.created_at).toISOString(),
    };
  });
  for (const field of ["platformKeyId", "prefix", "hash"] as const) {
    const values = keys.map((key) => key[field]);
    if (new Set(values).size !== values.length) throw new PlatformKeyConfigError(`PLATFORM_API_KEYS has two entries with the same ${field === "platformKeyId" ? "id" : field}.`);
  }
  return keys;
}

let cached: { raw: string; keys: PlatformKey[] } | undefined;

/** The configured keys, parsed once per distinct PLATFORM_API_KEYS value. */
export function configuredPlatformKeys(environment: Readonly<Record<string, string | undefined>> = process.env): PlatformKey[] {
  const raw = environment.PLATFORM_API_KEYS ?? "";
  if (cached?.raw === raw) return cached.keys;
  const keys = parsePlatformKeys(raw);
  cached = { raw, keys };
  return keys;
}

/**
 * Maps a presented key to its configured entry, comparing hashes in constant
 * time. Returns null for anything that isn't a configured key; throws
 * PlatformKeyConfigError when PLATFORM_API_KEYS itself is malformed.
 */
export function resolvePlatformKey(token: string, environment: Readonly<Record<string, string | undefined>> = process.env): ResolvedPlatformKey | null {
  if (!isWellFormedPlatformKey(token)) return null;
  const entry = configuredPlatformKeys(environment).find((key) => key.prefix === token.slice(0, PREFIX_LENGTH));
  if (!entry) return null;
  const presented = Buffer.from(hashPlatformKey(token), "hex");
  const stored = Buffer.from(entry.hash, "hex");
  if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) return null;
  const { hash: _hash, ...key } = entry;
  return key;
}

/**
 * Makes a new platform key and the PLATFORM_API_KEYS entry for it. The key is
 * shown once; only its hash goes in the entry. Without scopes, the entry lists
 * every scope a business's own key can hold today, plus the platform-only
 * scopes named in platformScopes: creating businesses and inviting owners are
 * granted only on purpose.
 */
export function generatePlatformKey(input: { name: string; group: string; ownerEmail: string; access?: PlatformKeyAccess; scopes?: readonly string[]; platformScopes?: readonly PlatformOnlyScope[]; now?: Date }): { key: string; entry: PlatformKeyEntry } {
  const shortId = randomBytes(4).toString("hex");
  const key = `${PLATFORM_API_KEY_PREFIX}${shortId}_${randomBytes(24).toString("base64url")}`;
  const candidate = {
    id: randomUUID(),
    prefix: `${PLATFORM_API_KEY_PREFIX}${shortId}`,
    hash: hashPlatformKey(key),
    name: input.name.trim(),
    group: input.group.trim(),
    owner_email: input.ownerEmail.trim(),
    access: input.access ?? "group",
    scopes: input.scopes?.length ? [...input.scopes] : [...businessApiKeyScopes, ...(input.platformScopes ?? [])],
    created_at: (input.now ?? new Date()).toISOString(),
  };
  const parsed = entrySchema.safeParse(candidate);
  if (!parsed.success) throw new PlatformKeyConfigError(`The new key is invalid: check ${[...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ")}.`);
  return { key, entry: candidate as PlatformKeyEntry };
}

/**
 * The warning pnpm platform-key:create prints with a key whose access is "all": it acts as its owner
 * on every business without being on any team, so the key and the owner's
 * account are root credentials for the deployment. Null for a key with group access.
 */
export function rootCredentialWarning(entry: { access?: string | undefined; owner_email: string }): string | null {
  if (entry.access !== "all") return null;
  return [
    `ROOT CREDENTIAL. This key has access "all": it acts as ${entry.owner_email} on every business on this deployment, without being on any team, and can read and change all of them.`,
    `Treat the key, and the ${entry.owner_email} account with its password, sessions and email inbox, like the database password. Give them to as few people as you can.`,
    "If either leaks, remove this entry from PLATFORM_API_KEYS, and secure the account.",
  ].join("\n");
}

/** The user id of a platform key's owner_email, or null when no LobbyStack account has verified that email. */
export async function resolvePlatformKeyOwner(context: DomainContext, ownerEmail: string): Promise<string | null> {
  const result = await context.db.execute<{ user_id: string | null }>(sql`select app.resolve_platform_key_owner(${ownerEmail}) as user_id`);
  return result.rows[0]?.user_id ?? null;
}

/**
 * Checks that a platform key may act on a business. The business must be
 * active, and a key with group access also needs the business linked to its group.
 * Every refusal is the same "Business not found", so a key can't tell a
 * business it may not touch from one that doesn't exist.
 */
export async function requirePlatformBusinessAccess(context: DomainContext, input: { businessId: string; groupId: string; access: PlatformKeyAccess }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [business] = await tx.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business || business.status !== "active") throw notFound("Business");
    // An operator's key reaches every active business as its owner, with no membership: a root credential (see rootCredentialWarning).
    if (input.access === "all") return;
    const [link] = await tx.select({ businessId: platformKeyBusinesses.businessId }).from(platformKeyBusinesses).where(and(eq(platformKeyBusinesses.businessId, input.businessId), eq(platformKeyBusinesses.groupId, input.groupId))).limit(1);
    if (!link) throw notFound("Business");
  });
}

/** Lets a group's platform keys act on a business. Linking twice is a no-op. */
export async function linkPlatformKeyBusiness(context: DomainContext, input: { businessId: string; groupId: string; platformKeyId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.insert(platformKeyBusinesses).values({ businessId: input.businessId, groupId: input.groupId, createdByPlatformKeyId: input.platformKeyId }).onConflictDoNothing();
  });
}
