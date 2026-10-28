import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { businesses, platformKeyBusinesses, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { PLATFORM_API_KEY_PREFIX, apiKeyScopes, businessApiKeyScopes, isApiKeyScope, isPartnerScope, type ApiKeyScope, type PlatformOnlyScope } from "@lobbystack/shared";

import type { DomainContext } from "../context";
import { notFound, PublicApiError } from "./errors";

// Platform keys create businesses and then manage them. They come from two
// places (ADR 0010). The host's keys are set in the admin's PLATFORM_API_KEYS
// environment variable as a JSON array, and each acts as the account its
// owner_email names. A partner makes its own keys in its console; those live
// in partner_platform_keys and act as the partner. Either way only the
// SHA-256 of a key is kept, not the key. A key carries 192 random bits, so a
// pepper or a slow hash would add nothing, and the hashes stay valid when
// ENCRYPTION_KEY changes. Keys look like lsp_<8 hex id>_<32 url-safe
// characters>; `pnpm platform-key:create` makes one and prints its entry.
//
// Each key belongs to a group. A host's entry names its group, and with group
// access the key reaches the businesses its group's keys created. Entries
// made before ADR 0010 call the group `partner` and the access `partner`;
// both still work. A partner's keys use the partner as their group. Every
// business of the partner is linked to that group, whichever the console or a
// key made it, so they reach the partner's businesses, and never every
// business.

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
  // Required, so a key never gains a scope added after it was made. A host's
  // key has no partner to act on, so the partner scopes are refused.
  scopes: z.array(z.enum(apiKeyScopes)).min(1).refine((scopes) => !scopes.some(isPartnerScope), { message: "The partner scopes are only for keys a partner makes in its console." }),
  created_at: z.iso.datetime({ offset: true }),
});

/** One PLATFORM_API_KEYS entry, as written in the environment variable. */
export type PlatformKeyEntry = z.input<typeof entrySchema>;

type PlatformKeyFields = {
  platformKeyId: string;
  prefix: string;
  name: string;
  /** The group the key belongs to. Audit rows and request logs carry it. */
  group: string;
  scopes: ApiKeyScope[];
  createdAt: string;
};

/** A host's key from PLATFORM_API_KEYS. It acts as the LobbyStack account its owner_email names. */
export type HostPlatformKey = PlatformKeyFields & { ownerEmail: string; access: PlatformKeyAccess; partnerId?: undefined };

/** A key a partner made in its console. It acts as the partner, has no account, and reaches only the partner's businesses. */
export type PartnerPlatformKey = PlatformKeyFields & { partnerId: string; access: "group"; ownerEmail?: undefined };

/** A platform key a request presented, without its hash. */
export type ResolvedPlatformKey = HostPlatformKey | PartnerPlatformKey;

type PlatformKey = HostPlatformKey & { hash: string };

export class PlatformKeyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformKeyConfigError";
  }
}

export function hashPlatformKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** A new random key, its prefix and the hash to keep. The key itself is shown once. */
export function newPlatformKeySecret(): { key: string; prefix: string; hash: string } {
  const shortId = randomBytes(4).toString("hex");
  const key = `${PLATFORM_API_KEY_PREFIX}${shortId}_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: `${PLATFORM_API_KEY_PREFIX}${shortId}`, hash: hashPlatformKey(key) };
}

/** The group a partner's keys belong to: the partner itself. */
export function partnerPlatformKeyGroup(partnerId: string): string {
  return partnerId;
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
 * Maps a presented key to its PLATFORM_API_KEYS entry, comparing hashes in
 * constant time. Returns null for anything that isn't a configured key;
 * throws PlatformKeyConfigError when PLATFORM_API_KEYS itself is malformed.
 */
export function resolveConfiguredPlatformKey(token: string, environment: Readonly<Record<string, string | undefined>> = process.env): HostPlatformKey | null {
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
 * Maps a presented key to a platform key: PLATFORM_API_KEYS first, then the
 * keys partners made in their consoles. Revoked and unknown keys resolve to
 * null. A malformed PLATFORM_API_KEYS throws PlatformKeyConfigError before the
 * database is asked, so a bad deployment refuses every platform key. A
 * partner's key always has group access over its partner's businesses.
 */
export async function resolvePlatformKey(context: DomainContext, token: string, environment: Readonly<Record<string, string | undefined>> = process.env): Promise<ResolvedPlatformKey | null> {
  if (!isWellFormedPlatformKey(token)) return null;
  const configured = resolveConfiguredPlatformKey(token, environment);
  if (configured) return configured;
  const result = await context.db.execute<{ platform_key_id: string; partner_id: string; prefix: string; name: string; scopes: unknown; created_at: Date | string }>(sql`select platform_key_id, partner_id, prefix, name, scopes, created_at from app.resolve_partner_platform_key(${hashPlatformKey(token)})`);
  const row = result.rows[0];
  if (!row) return null;
  return {
    platformKeyId: row.platform_key_id,
    prefix: row.prefix,
    name: row.name,
    group: partnerPlatformKeyGroup(row.partner_id),
    partnerId: row.partner_id,
    access: "group",
    // Canonical order, and only scopes this version knows.
    scopes: Array.isArray(row.scopes) ? apiKeyScopes.filter((scope) => (row.scopes as unknown[]).includes(scope)) : [],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** What only the host's platform keys may do. */
export type HostOnlyPlatformOperation = "checkout" | "claim_link" | "managed_plan";

const partnerPlatformKeyRefusals: Record<HostOnlyPlatformOperation, string> = {
  checkout: "A partner's platform key can't start a Polar checkout. A partner's businesses don't buy the host's plans.",
  claim_link: "A partner's platform key can't create claim links. A partner's business stays with the partner, which can release it to its owner.",
  managed_plan: "A partner's platform key can't manage a plan outside Polar. Only the host's platform keys with access to every business can.",
};

/**
 * Refuses a key a partner made what only the host's keys may do: start a
 * Polar checkout, create a claim link, or manage a plan outside Polar (ADR
 * 0010). Takes a key or the caller it became. A partner member's caller,
 * which acts for the partner too, is refused the same; anything else passes.
 */
export function refusePartnerPlatformKey(subject: { partnerId?: string | undefined }, operation: HostOnlyPlatformOperation): void {
  if (subject.partnerId !== undefined) throw new PublicApiError(403, "forbidden", partnerPlatformKeyRefusals[operation]);
}

/**
 * Holds a share lock on a partner's platform key until the transaction ends,
 * and refuses the request with 401 once the key is revoked. A request
 * resolves its key before its transaction starts, so whatever a key leaves
 * behind, such as a webhook endpoint or an invitation, is written after this
 * in the same transaction: revoking the key then waits for the write, and
 * turns off what it wrote.
 */
export async function lockActivePartnerPlatformKey(tx: DatabaseTransaction, platformKeyId: string): Promise<void> {
  const result = await tx.execute<{ active: boolean }>(sql`select app.lock_active_partner_platform_key(${platformKeyId}::uuid) as active`);
  if (result.rows[0]?.active !== true) throw new PublicApiError(401, "unauthorized", "The API key is invalid or has been revoked.", undefined, { "WWW-Authenticate": "Bearer" });
}

/** Records that a partner's key was used, at most once a minute. A host's key has no row to record it on. */
export async function touchPlatformKeyLastUsed(context: DomainContext, key: ResolvedPlatformKey): Promise<void> {
  if (key.partnerId === undefined) return;
  await context.db.execute(sql`select app.touch_partner_platform_key(${key.platformKeyId}::uuid)`);
}

/**
 * Scopes for a new platform key: a non-empty list of known scopes, the
 * platform-only ones included, in canonical order. Returns null for anything
 * else, so each caller words its own refusal.
 */
export function normalizePlatformKeyScopes(value: unknown): ApiKeyScope[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isApiKeyScope)) return null;
  return apiKeyScopes.filter((scope) => value.includes(scope));
}

/**
 * Makes a new platform key and the PLATFORM_API_KEYS entry for it. The key is
 * shown once; only its hash goes in the entry. Without scopes, the entry lists
 * every scope a business's own key can hold today, plus the platform-only
 * scopes named in platformScopes: creating businesses and inviting owners are
 * granted only on purpose.
 */
export function generatePlatformKey(input: { name: string; group: string; ownerEmail: string; access?: PlatformKeyAccess; scopes?: readonly string[]; platformScopes?: readonly PlatformOnlyScope[]; now?: Date }): { key: string; entry: PlatformKeyEntry } {
  const partnerOnly = [...(input.scopes ?? []), ...(input.platformScopes ?? [])].filter(isPartnerScope);
  if (partnerOnly.length) throw new PlatformKeyConfigError(`${partnerOnly.join(", ")} ${partnerOnly.length > 1 ? "are" : "is"} only for keys a partner makes on its console's API keys page, which act as the partner. A key in PLATFORM_API_KEYS acts as its owner_email account and has no partner.`);
  const { key, prefix, hash } = newPlatformKeySecret();
  const candidate = {
    id: randomUUID(),
    prefix,
    hash,
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
 * What a key reaches: its group and access. A partner's key has the
 * partner as its group and always group access, and also names the partner,
 * whose businesses are the only ones its group holds.
 */
export type PlatformKeyReach = { groupId: string; access: PlatformKeyAccess; partnerId?: undefined } | { groupId: string; access: "group"; partnerId: string };

export function platformKeyReach(key: ResolvedPlatformKey): PlatformKeyReach {
  return key.partnerId === undefined ? { groupId: key.group, access: key.access } : { groupId: key.group, access: "group", partnerId: key.partnerId };
}

/**
 * Checks that a platform key may act on a business. The business must be
 * active. A key with group access needs the business linked to its group,
 * and only a host's key can have access to every business. A partner's group
 * holds only the partner's businesses, which the database keeps true; a
 * partner's key also checks that the business is still its partner's. Every
 * refusal is the same "Business not found", so a key can't tell a business it
 * may not touch from one that doesn't exist.
 */
export async function requirePlatformBusinessAccess(context: DomainContext, input: { businessId: string } & PlatformKeyReach): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [business] = await tx.select({ status: businesses.status, partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business || business.status !== "active") throw notFound("Business");
    if (input.partnerId !== undefined && business.partnerId !== input.partnerId) throw notFound("Business");
    // The host's key with access "all" reaches every active business as its owner, with no membership: a root credential (see rootCredentialWarning).
    if (input.partnerId === undefined && input.access === "all") return;
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
