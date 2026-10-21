import { createHash } from "node:crypto";

import { apiKeyScopes, businessApiKeyScopes, isUuid } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { callerAudit, callerPrincipalId, platformBusinessId, type PlatformKeyCaller } from "./operations";
import { generatePlatformKey, isPlatformKeyToken, isWellFormedPlatformKey, parsePlatformKeys, PlatformKeyConfigError, resolvePlatformKey, rootCredentialWarning } from "./platformKeys";

function environment(...entries: unknown[]) {
  return { PLATFORM_API_KEYS: JSON.stringify(entries) };
}

describe("platform keys", () => {
  it("generates lsp_ keys whose entry stores only a SHA-256 of the key", () => {
    const { key, entry } = generatePlatformKey({ name: "AlloPlace CLI", partner: "alloplace", ownerEmail: "ops@alloplace.example", access: "all", now: new Date("2026-10-11T20:00:00Z") });
    expect(key).toMatch(/^lsp_[0-9a-f]{8}_[A-Za-z0-9_-]{32}$/);
    expect(isWellFormedPlatformKey(key)).toBe(true);
    expect(isPlatformKeyToken(key)).toBe(true);
    expect(key.startsWith(`${entry.prefix}_`)).toBe(true);
    expect(entry.hash).toBe(createHash("sha256").update(key).digest("hex"));
    expect(JSON.stringify(entry)).not.toContain(key.slice(13));
    expect(entry).toMatchObject({ name: "AlloPlace CLI", partner: "alloplace", owner_email: "ops@alloplace.example", access: "all", created_at: "2026-10-11T20:00:00.000Z" });
    expect(generatePlatformKey({ name: "x", partner: "x", ownerEmail: "x@example.com" }).key).not.toBe(key);
  });

  it("refuses a new key with a bad partner, email or scope", () => {
    expect(() => generatePlatformKey({ name: "Bad", partner: "Not A Slug", ownerEmail: "ops@example.com" })).toThrow(PlatformKeyConfigError);
    expect(() => generatePlatformKey({ name: "Bad", partner: "acme", ownerEmail: "not-an-email" })).toThrow(/owner_email/);
    expect(() => generatePlatformKey({ name: "Bad", partner: "acme", ownerEmail: "ops@example.com", scopes: ["calls:write"] })).toThrow(/scopes/);
  });

  it("resolves a configured key and nothing else", () => {
    const { key, entry } = generatePlatformKey({ name: "Partner", partner: "acme", ownerEmail: "ops@acme.example", scopes: ["business:read", "businesses:create"] });
    const other = generatePlatformKey({ name: "Other", partner: "other", ownerEmail: "ops@other.example" });
    const env = environment(entry, other.entry);
    expect(resolvePlatformKey(key, env)).toEqual({
      platformKeyId: entry.id,
      prefix: entry.prefix,
      name: "Partner",
      partnerId: "acme",
      ownerEmail: "ops@acme.example",
      access: "partner",
      scopes: ["business:read", "businesses:create"],
      createdAt: entry.created_at,
    });
    // Same prefix, different secret.
    expect(resolvePlatformKey(`${entry.prefix}_${"A".repeat(32)}`, env)).toBeNull();
    // A well-formed key nobody configured.
    expect(resolvePlatformKey(`lsp_00000000_${"A".repeat(32)}`, env)).toBeNull();
    expect(resolvePlatformKey("lsp_short", env)).toBeNull();
    expect(resolvePlatformKey(key, {})).toBeNull();
  });

  it("defaults to partner access and a business key's scopes, with platform-only scopes granted only when asked for", () => {
    const { entry } = generatePlatformKey({ name: "Defaults", partner: "acme", ownerEmail: "ops@acme.example" });
    expect(entry.scopes).toEqual([...businessApiKeyScopes]);
    expect(entry.scopes).not.toContain("businesses:create");
    expect(entry.scopes).not.toContain("users:create");
    const { access: _access, ...withoutAccess } = entry;
    const [parsed] = parsePlatformKeys(JSON.stringify([withoutAccess]));
    expect(parsed?.access).toBe("partner");
    expect(parsed?.scopes).toEqual([...businessApiKeyScopes]);
    expect(generatePlatformKey({ name: "Onboarding", partner: "acme", ownerEmail: "ops@acme.example", platformScopes: ["businesses:create"] }).entry.scopes).toEqual([...businessApiKeyScopes, "businesses:create"]);
    expect(generatePlatformKey({ name: "Everything", partner: "acme", ownerEmail: "ops@acme.example", platformScopes: ["businesses:create", "users:create"] }).entry.scopes).toEqual(expect.arrayContaining([...apiKeyScopes]));
    const [ordered] = parsePlatformKeys(JSON.stringify([{ ...entry, scopes: ["users:create", "business:read"] }]));
    expect(ordered?.scopes).toEqual(["business:read", "users:create"]);
  });

  it("warns that a key reaching every business, and its owner account, are root credentials", () => {
    const { entry } = generatePlatformKey({ name: "Operator", partner: "lobbystack", ownerEmail: "ops@example.com", access: "all" });
    const warning = rootCredentialWarning(entry);
    expect(warning).toContain("ROOT CREDENTIAL");
    expect(warning).toContain("acts as ops@example.com on every business");
    expect(warning).toContain("the ops@example.com account with its password, sessions and email inbox");
    expect(rootCredentialWarning(generatePlatformKey({ name: "Partner", partner: "acme", ownerEmail: "ops@acme.example" }).entry)).toBeNull();
  });

  it("requires every entry to list its scopes, so a key never gains a scope added later", () => {
    const { entry } = generatePlatformKey({ name: "Explicit", partner: "acme", ownerEmail: "ops@acme.example" });
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
    const { entry } = generatePlatformKey({ name: "Partner", partner: "acme", ownerEmail: "ops@acme.example" });
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

  it("refuses two entries with the same id, prefix or hash", () => {
    const first = generatePlatformKey({ name: "One", partner: "acme", ownerEmail: "ops@acme.example" }).entry;
    const second = generatePlatformKey({ name: "Two", partner: "acme", ownerEmail: "ops@acme.example" }).entry;
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

  it("attributes platform key calls to the key, its partner and its owner", () => {
    const caller: PlatformKeyCaller = { businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", platformKeyId: "8b0c3f8e-1d2a-4b5c-9e6f-7a8b9c0d1e2f", partnerId: "acme", actingUserId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", actor: "platform_key" };
    expect(callerPrincipalId(caller)).toBe("platform:8b0c3f8e-1d2a-4b5c-9e6f-7a8b9c0d1e2f");
    expect(callerAudit(caller)).toEqual({ actorUserId: null, payload: { actor: "platform_key", platformKeyId: caller.platformKeyId, partnerId: "acme", actingUserId: caller.actingUserId } });
    expect(callerPrincipalId({ businessId: caller.businessId, apiKeyId: "k1" })).toBe("k1");
  });
});
