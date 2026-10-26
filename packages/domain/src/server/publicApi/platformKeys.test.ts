import { createHash } from "node:crypto";

import { apiKeyScopes, businessApiKeyScopes, isUuid } from "@lobbystack/shared";
import { describe, expect, it, vi } from "vitest";

import { callerAudit, callerPrincipalId, platformBusinessId, type PlatformKeyCaller } from "./operations";
import { PublicApiError } from "./errors";
import { generatePlatformKey, isPlatformKeyToken, isWellFormedPlatformKey, newPlatformKeySecret, normalizePlatformKeyScopes, parsePlatformKeys, PlatformKeyConfigError, platformKeyReach, refusePartnerPlatformKey, resolveConfiguredPlatformKey, resolvePlatformKey, rootCredentialWarning, type PartnerPlatformKey } from "./platformKeys";

function environment(...entries: unknown[]) {
  return { PLATFORM_API_KEYS: JSON.stringify(entries) };
}

describe("platform keys", () => {
  it("generates lsp_ keys whose entry stores only a SHA-256 of the key", () => {
    const { key, entry } = generatePlatformKey({ name: "AlloPlace CLI", group: "alloplace", ownerEmail: "ops@alloplace.example", access: "all", now: new Date("2026-10-11T20:00:00Z") });
    expect(key).toMatch(/^lsp_[0-9a-f]{8}_[A-Za-z0-9_-]{32}$/);
    expect(isWellFormedPlatformKey(key)).toBe(true);
    expect(isPlatformKeyToken(key)).toBe(true);
    expect(key.startsWith(`${entry.prefix}_`)).toBe(true);
    expect(entry.hash).toBe(createHash("sha256").update(key).digest("hex"));
    expect(JSON.stringify(entry)).not.toContain(key.slice(13));
    expect(entry).toMatchObject({ name: "AlloPlace CLI", group: "alloplace", owner_email: "ops@alloplace.example", access: "all", created_at: "2026-10-11T20:00:00.000Z" });
    // New entries never use the old name.
    expect(entry).not.toHaveProperty("partner");
    expect(generatePlatformKey({ name: "x", group: "x", ownerEmail: "x@example.com" }).key).not.toBe(key);
  });

  it("refuses a new key with a bad group, email or scope", () => {
    expect(() => generatePlatformKey({ name: "Bad", group: "Not A Slug", ownerEmail: "ops@example.com" })).toThrow(/check group/);
    expect(() => generatePlatformKey({ name: "Bad", group: "acme", ownerEmail: "not-an-email" })).toThrow(/owner_email/);
    expect(() => generatePlatformKey({ name: "Bad", group: "acme", ownerEmail: "ops@example.com", scopes: ["calls:write"] })).toThrow(/scopes/);
  });

  it("resolves a configured key and nothing else", () => {
    const { key, entry } = generatePlatformKey({ name: "Acme", group: "acme", ownerEmail: "ops@acme.example", scopes: ["business:read", "businesses:create"] });
    const other = generatePlatformKey({ name: "Other", group: "other", ownerEmail: "ops@other.example" });
    const env = environment(entry, other.entry);
    expect(resolveConfiguredPlatformKey(key, env)).toEqual({
      platformKeyId: entry.id,
      prefix: entry.prefix,
      name: "Acme",
      group: "acme",
      ownerEmail: "ops@acme.example",
      access: "group",
      scopes: ["business:read", "businesses:create"],
      createdAt: entry.created_at,
    });
    // Same prefix, different secret.
    expect(resolveConfiguredPlatformKey(`${entry.prefix}_${"A".repeat(32)}`, env)).toBeNull();
    // A well-formed key nobody configured.
    expect(resolveConfiguredPlatformKey(`lsp_00000000_${"A".repeat(32)}`, env)).toBeNull();
    expect(resolveConfiguredPlatformKey("lsp_short", env)).toBeNull();
    expect(resolveConfiguredPlatformKey(key, {})).toBeNull();
  });

  it("defaults to group access and a business key's scopes, with platform-only scopes granted only when asked for", () => {
    const { entry } = generatePlatformKey({ name: "Defaults", group: "acme", ownerEmail: "ops@acme.example" });
    expect(entry.access).toBe("group");
    expect(entry.scopes).toEqual([...businessApiKeyScopes]);
    expect(entry.scopes).not.toContain("businesses:create");
    expect(entry.scopes).not.toContain("users:create");
    const { access: _access, ...withoutAccess } = entry;
    const [parsed] = parsePlatformKeys(JSON.stringify([withoutAccess]));
    expect(parsed?.access).toBe("group");
    expect(parsed?.scopes).toEqual([...businessApiKeyScopes]);
    expect(generatePlatformKey({ name: "Onboarding", group: "acme", ownerEmail: "ops@acme.example", platformScopes: ["businesses:create"] }).entry.scopes).toEqual([...businessApiKeyScopes, "businesses:create"]);
    expect(generatePlatformKey({ name: "Everything", group: "acme", ownerEmail: "ops@acme.example", platformScopes: ["businesses:create", "users:create"] }).entry.scopes).toEqual(expect.arrayContaining([...apiKeyScopes]));
    const [ordered] = parsePlatformKeys(JSON.stringify([{ ...entry, scopes: ["users:create", "business:read"] }]));
    expect(ordered?.scopes).toEqual(["business:read", "users:create"]);
  });

  it("warns that a key reaching every business, and its owner account, are root credentials", () => {
    const { entry } = generatePlatformKey({ name: "Operator", group: "lobbystack", ownerEmail: "ops@example.com", access: "all" });
    const warning = rootCredentialWarning(entry);
    expect(warning).toContain("ROOT CREDENTIAL");
    expect(warning).toContain("acts as ops@example.com on every business");
    expect(warning).toContain("the ops@example.com account with its password, sessions and email inbox");
    expect(rootCredentialWarning(generatePlatformKey({ name: "Acme", group: "acme", ownerEmail: "ops@acme.example" }).entry)).toBeNull();
  });

  it("requires every entry to list its scopes, so a key never gains a scope added later", () => {
    const { entry } = generatePlatformKey({ name: "Explicit", group: "acme", ownerEmail: "ops@acme.example" });
    const { scopes: _scopes, ...withoutScopes } = entry;
    expect(() => parsePlatformKeys(JSON.stringify([withoutScopes]))).toThrow(/check scopes/);
    expect(() => parsePlatformKeys(JSON.stringify([{ ...entry, scopes: [] }]))).toThrow(/check scopes/);
  });

  it("treats an unset or empty PLATFORM_API_KEYS as no keys", () => {
    expect(parsePlatformKeys(undefined)).toEqual([]);
    expect(parsePlatformKeys("   ")).toEqual([]);
    expect(parsePlatformKeys("[]")).toEqual([]);
  });

  it("refuses a malformed PLATFORM_API_KEYS without echoing its values", () => {
    const { entry } = generatePlatformKey({ name: "Acme", group: "acme", ownerEmail: "ops@acme.example" });
    expect(() => parsePlatformKeys("{not json")).toThrow(/not valid JSON/);
    expect(() => parsePlatformKeys(JSON.stringify(entry))).toThrow(/JSON array/);
    const { owner_email: _owner, ...withoutOwner } = entry;
    expect(() => parsePlatformKeys(JSON.stringify([withoutOwner]))).toThrow(/entry 0 is invalid: check owner_email/);
    const badHash = { ...entry, hash: "not-a-hash" };
    const error = (() => { try { parsePlatformKeys(JSON.stringify([badHash])); } catch (caught) { return caught as Error; } return null; })();
    expect(error).toBeInstanceOf(PlatformKeyConfigError);
    expect(error?.message).toContain("hash");
    expect(error?.message).not.toContain("not-a-hash");
    expect(() => parsePlatformKeys(JSON.stringify([{ ...entry, extra: true }]))).toThrow(PlatformKeyConfigError);
  });

  it("accepts an entry written before the rename, with partner for its group and its access", () => {
    const { key, entry } = generatePlatformKey({ name: "AlloPlace CLI", group: "alloplace", ownerEmail: "ops@alloplace.example" });
    const { group: _group, ...rest } = entry;
    const legacy = { ...rest, partner: "alloplace", access: "partner" };
    const renamed = resolveConfiguredPlatformKey(key, environment(entry));
    expect(renamed).toMatchObject({ group: "alloplace", access: "group" });
    // The same group and access, so the key reaches the same businesses.
    expect(resolveConfiguredPlatformKey(key, environment(legacy))).toEqual(renamed);
    // Without access, an old entry defaults to the group, as before.
    const { access: _access, ...noAccess } = legacy;
    expect(resolveConfiguredPlatformKey(key, environment(noAccess))).toEqual(renamed);
    // The field and the access value are separate aliases.
    expect(resolveConfiguredPlatformKey(key, environment({ ...rest, partner: "alloplace", access: "group" }))).toEqual(renamed);
    expect(resolveConfiguredPlatformKey(key, environment({ ...entry, access: "partner" }))).toEqual(renamed);
    expect(resolveConfiguredPlatformKey(key, environment({ ...legacy, access: "all" }))).toMatchObject({ group: "alloplace", access: "all" });
  });

  it("reads a value that mixes old and new entries, as pnpm platform-key:create prints after the rename", () => {
    const old = generatePlatformKey({ name: "Old", group: "alloplace", ownerEmail: "ops@alloplace.example" }).entry;
    const { group: _group, ...rest } = old;
    const added = generatePlatformKey({ name: "New", group: "acme", ownerEmail: "ops@acme.example", access: "all" }).entry;
    expect(parsePlatformKeys(JSON.stringify([{ ...rest, partner: "alloplace", access: "partner" }, added])).map((key) => [key.name, key.group, key.access])).toEqual([["Old", "alloplace", "group"], ["New", "acme", "all"]]);
  });

  it("refuses an entry that sets both group and partner, or neither, naming the entry but no value", () => {
    const first = generatePlatformKey({ name: "First", group: "acme", ownerEmail: "ops@acme.example" }).entry;
    const second = generatePlatformKey({ name: "Second", group: "secret-group", ownerEmail: "ops@acme.example" }).entry;
    const error = (() => { try { parsePlatformKeys(JSON.stringify([first, { ...second, partner: "other-group" }])); } catch (caught) { return caught as Error; } return null; })();
    expect(error).toBeInstanceOf(PlatformKeyConfigError);
    expect(error?.message).toBe("PLATFORM_API_KEYS entry 1 sets both group and partner, the old name for group. Remove partner.");
    // Even the same value in both is refused.
    expect(() => parsePlatformKeys(JSON.stringify([{ ...first, partner: "acme" }]))).toThrow(/entry 0 sets both group and partner/);
    const { group: _group, ...withoutGroup } = first;
    expect(() => parsePlatformKeys(JSON.stringify([withoutGroup]))).toThrow("PLATFORM_API_KEYS entry 0 is invalid: check group.");
    expect(() => parsePlatformKeys(JSON.stringify([{ ...withoutGroup, partner: "Not A Slug" }]))).toThrow(/entry 0 is invalid: check partner/);
    expect(() => parsePlatformKeys(JSON.stringify([{ ...first, access: "reseller" }]))).toThrow(/entry 0 is invalid: check access/);
  });

  it("refuses two entries with the same id, prefix or hash", () => {
    const first = generatePlatformKey({ name: "One", group: "acme", ownerEmail: "ops@acme.example" }).entry;
    const second = generatePlatformKey({ name: "Two", group: "acme", ownerEmail: "ops@acme.example" }).entry;
    expect(() => parsePlatformKeys(JSON.stringify([first, { ...second, id: first.id }]))).toThrow(/same id/);
    expect(() => parsePlatformKeys(JSON.stringify([first, { ...second, prefix: first.prefix }]))).toThrow(/same prefix/);
    expect(() => parsePlatformKeys(JSON.stringify([first, { ...second, hash: first.hash }]))).toThrow(/same hash/);
  });

  it("derives one business id per platform key and Idempotency-Key", () => {
    const keyId = "8b0c3f8e-1d2a-4b5c-9e6f-7a8b9c0d1e2f";
    const id = platformBusinessId(keyId, "onboard-acme");
    expect(isUuid(id)).toBe(true);
    // Version 8 and the RFC 9562 variant, so it is a valid UUID everywhere.
    expect(id[14]).toBe("8");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
    expect(platformBusinessId(keyId, "onboard-acme")).toBe(id);
    expect(platformBusinessId(keyId, "onboard-acme-2")).not.toBe(id);
    expect(platformBusinessId("1c8d2e3f-4051-4b62-9c73-8d94ea5b6c7d", "onboard-acme")).not.toBe(id);
  });

  it("attributes platform key calls to the key, its group and its owner", () => {
    const caller: PlatformKeyCaller = { businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", platformKeyId: "8b0c3f8e-1d2a-4b5c-9e6f-7a8b9c0d1e2f", groupId: "acme", actingUserId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", actor: "platform_key" };
    expect(callerPrincipalId(caller)).toBe("platform:8b0c3f8e-1d2a-4b5c-9e6f-7a8b9c0d1e2f");
    expect(callerAudit(caller)).toEqual({ actorUserId: null, payload: { actor: "platform_key", platformKeyId: caller.platformKeyId, groupId: "acme", actingUserId: caller.actingUserId } });
    expect(callerPrincipalId({ businessId: caller.businessId, apiKeyId: "k1" })).toBe("k1");
  });

  it("attributes a partner's key to the key and the partner, which is also its group", () => {
    const partnerId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
    const caller: PlatformKeyCaller = { businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", platformKeyId: "8b0c3f8e-1d2a-4b5c-9e6f-7a8b9c0d1e2f", groupId: partnerId, partnerId, actor: "platform_key" };
    expect(callerPrincipalId(caller)).toBe("platform:8b0c3f8e-1d2a-4b5c-9e6f-7a8b9c0d1e2f");
    expect(callerAudit(caller)).toEqual({ actorUserId: null, payload: { actor: "platform_key", platformKeyId: caller.platformKeyId, groupId: partnerId, partnerId } });
  });

  it("makes a partner's keys in the same lsp_ format, keeping only the SHA-256", () => {
    const { key, prefix, hash } = newPlatformKeySecret();
    expect(isWellFormedPlatformKey(key)).toBe(true);
    expect(key.startsWith(`${prefix}_`)).toBe(true);
    expect(hash).toBe(createHash("sha256").update(key).digest("hex"));
    expect(newPlatformKeySecret().key).not.toBe(key);
  });

  it("takes a non-empty list of known scopes for a new key, in canonical order, platform-only ones included", () => {
    expect(normalizePlatformKeyScopes(["users:create", "business:read", "business:read"])).toEqual(["business:read", "users:create"]);
    expect(normalizePlatformKeyScopes([...apiKeyScopes].reverse())).toEqual([...apiKeyScopes]);
    for (const value of [[], ["root"], ["business:read", 7], "business:read", null, undefined]) expect(normalizePlatformKeyScopes(value)).toBeNull();
  });

  it("lets a partner's key reach its partner's group, and a host's key its group or every business", () => {
    const { key, entry } = generatePlatformKey({ name: "Host", group: "acme", ownerEmail: "ops@acme.example", access: "all" });
    expect(platformKeyReach(resolveConfiguredPlatformKey(key, environment(entry))!)).toEqual({ groupId: "acme", access: "all" });
    expect(platformKeyReach(resolveConfiguredPlatformKey(key, environment({ ...entry, access: "group" }))!)).toEqual({ groupId: "acme", access: "group" });
    const partner: PartnerPlatformKey = { platformKeyId: entry.id, prefix: entry.prefix, name: "Partner", group: "p1", partnerId: "p1", access: "group", scopes: ["business:read"], createdAt: entry.created_at };
    expect(platformKeyReach(partner)).toEqual({ groupId: "p1", access: "group", partnerId: "p1" });
  });

  it("refuses a partner's key what only the host's keys may do, and lets every other caller through", () => {
    for (const operation of ["checkout", "claim_link", "managed_plan"] as const) {
      const error = (() => { try { refusePartnerPlatformKey({ partnerId: "p1" }, operation); } catch (caught) { return caught; } return null; })();
      expect(error).toBeInstanceOf(PublicApiError);
      expect(error).toMatchObject({ status: 403, code: "forbidden" });
      expect(() => refusePartnerPlatformKey({}, operation)).not.toThrow();
      expect(() => refusePartnerPlatformKey({ partnerId: undefined }, operation)).not.toThrow();
    }
  });

  it("answers a host's key from PLATFORM_API_KEYS without asking the database", async () => {
    const { key, entry } = generatePlatformKey({ name: "Host", group: "acme", ownerEmail: "ops@acme.example" });
    const execute = vi.fn(async () => ({ rows: [] }));
    const context = { db: { execute } } as unknown as Parameters<typeof resolvePlatformKey>[0];
    expect(await resolvePlatformKey(context, key, environment(entry))).toMatchObject({ platformKeyId: entry.id, ownerEmail: "ops@acme.example" });
    expect(execute).not.toHaveBeenCalled();
    // Nothing that isn't a well-formed key reaches the database either.
    expect(await resolvePlatformKey(context, "lsp_short", environment(entry))).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    // A key that isn't in PLATFORM_API_KEYS is looked up by its hash only.
    const other = newPlatformKeySecret();
    expect(await resolvePlatformKey(context, other.key, environment(entry))).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(execute.mock.calls)).not.toContain(other.key);
  });
});
