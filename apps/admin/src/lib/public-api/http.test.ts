import { beforeEach, describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({
  runIdempotent: vi.fn(),
  touchApiKeyLastUsed: vi.fn(async () => undefined),
}));

const reporting = vi.hoisted(() => ({ reportServerError: vi.fn() }));

vi.mock("../domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("../error-reporting", () => reporting);
// Only the public API modules are loaded; the rest of @lobbystack/domain is not needed here.
vi.mock("@lobbystack/domain", async () => ({
  ...(await import("../../../../../packages/domain/src/server/publicApi/errors")),
  ...(await import("../../../../../packages/domain/src/server/publicApi/apiKeys")),
  ...(await import("../../../../../packages/domain/src/server/publicApi/idempotency")),
  ...(await import("../../../../../packages/domain/src/server/publicApi/platformKeys")),
  ...domain,
}));

import { PlatformKeyConfigError, PublicApiError, type ResolvedApiKey, type ResolvedPlatformKey } from "@lobbystack/domain";

import { handleApiRequest } from "./http";

const businessA = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
const businessB = "9e8d7c6b-5a49-4382-a716-1f2e3d4c5b6a";
const key: ResolvedApiKey = { businessId: businessA, apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["contacts:read", "contacts:write"] };
const allow = async () => ({ allowed: true as const, limit: 120, remaining: 119, resetAt: 1_800_000_060 });

function request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  return new Request(`https://app.example.com/api/v1${path}`, init);
}

describe("v1 request pipeline", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("rejects a missing key with 401 and the v1 error shape", async () => {
    const response = await handleApiRequest(request("/contacts"), "listContacts", async () => ({ body: {} }), { resolveKey: async () => key, rateLimit: allow });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.json()).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
  });

  it("rejects unknown and revoked keys with 401", async () => {
    const handler = vi.fn();
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: "Bearer lsk_revoked" } }), "listContacts", handler, { resolveKey: async () => null, rateLimit: allow });
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("enforces the scope each operation declares", async () => {
    const handler = vi.fn();
    const response = await handleApiRequest(request("/calls", { headers: { authorization: "Bearer lsk_x" } }), "listCalls", handler, { resolveKey: async () => key, rateLimit: allow });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "insufficient_scope", message: expect.stringContaining("calls:read") } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler as the key's business and adds rate-limit headers", async () => {
    const handler = vi.fn(async ({ caller }: { caller: { businessId: string } }) => ({ body: { data: [], next_cursor: null, has_more: false, business: caller.businessId } }));
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: "Bearer lsk_x" } }), "listContacts", handler as never, { resolveKey: async () => key, rateLimit: allow });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ business: businessA });
    expect(response.headers.get("x-ratelimit-remaining")).toBe("119");
  });

  it("returns 429 with Retry-After when the key is over its limit", async () => {
    const handler = vi.fn();
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: "Bearer lsk_x" } }), "listContacts", handler, { resolveKey: async () => key, rateLimit: async () => ({ allowed: false, reason: "limited", limit: 120, remaining: 0, resetAt: 1_800_000_060, retryAfterSeconds: 17 }) });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(response.headers.get("x-ratelimit-limit")).toBe("120");
    expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("maps domain errors to their public codes and hides internal ones", async () => {
    const conflict = await handleApiRequest(request("/contacts", { method: "POST", headers: { authorization: "Bearer lsk_x" } }), "createContact", async () => { throw new PublicApiError(409, "conflict", "Duplicate."); }, { resolveKey: async () => key, rateLimit: allow });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: { code: "conflict", message: "Duplicate." } });
    const crash = await handleApiRequest(request("/contacts", { headers: { authorization: "Bearer lsk_x" } }), "listContacts", async () => { throw new Error("password=hunter2 connection refused"); }, { resolveKey: async () => key, rateLimit: allow });
    expect(crash.status).toBe(500);
    const body = await crash.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).not.toContain("hunter2");
  });

  it("runs the handler on the idempotency transaction and replays the stored response", async () => {
    const transactional = { db: { transaction: "tx" } };
    domain.runIdempotent.mockImplementationOnce(async (_context, _scope, _hash, run) => ({ replayed: false, response: await run(transactional) }));
    const handler = vi.fn(async (_input: { context: unknown }) => ({ body: { data: { id: "c1" } } }));
    const init = { method: "POST", body: JSON.stringify({ phone: "+14165550134" }), headers: { authorization: "Bearer lsk_x", "idempotency-key": "retry-1" } };
    const first = await handleApiRequest(request("/contacts", init), "createContact", handler, { resolveKey: async () => key, rateLimit: allow });
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ data: { id: "c1" } });
    expect(handler.mock.calls[0]?.[0].context).toBe(transactional);
    expect(domain.runIdempotent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: "retry-1", apiKeyId: key.apiKeyId, operation: "createContact", businessId: businessA }), expect.any(String), expect.any(Function));

    domain.runIdempotent.mockResolvedValueOnce({ replayed: true, response: { status: 201, body: JSON.stringify({ data: { id: "c1" } }) } });
    const replay = await handleApiRequest(request("/contacts", init), "createContact", handler, { resolveKey: async () => key, rateLimit: allow });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(await replay.json()).toEqual({ data: { id: "c1" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns the error when the idempotent transaction fails", async () => {
    domain.runIdempotent.mockImplementationOnce(async (_context, _scope, _hash, run) => await run({ db: {} }));
    const response = await handleApiRequest(request("/contacts", { method: "POST", body: "{}", headers: { authorization: "Bearer lsk_x", "idempotency-key": "retry-2" } }), "createContact", async () => { throw new PublicApiError(409, "conflict", "Duplicate."); }, { resolveKey: async () => key, rateLimit: allow });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "conflict", message: "Duplicate." } });
  });

  it("never stores the createWebhook response, which holds the plain signing secret", async () => {
    const webhookKey: ResolvedApiKey = { ...key, scopes: ["webhooks:manage"] };
    const response = await handleApiRequest(request("/webhooks", { method: "POST", body: "{}", headers: { authorization: "Bearer lsk_x", "idempotency-key": "k" } }), "createWebhook", async () => ({ body: { data: { secret: "whsec_x" } } }), { resolveKey: async () => webhookKey, rateLimit: allow });
    expect(response.status).toBe(201);
    expect(domain.runIdempotent).not.toHaveBeenCalled();
  });

  it("ignores Idempotency-Key on operations that do not create things", async () => {
    const response = await handleApiRequest(request("/appointments/x/cancel", { method: "POST", headers: { authorization: "Bearer lsk_x", "idempotency-key": "k" } }), "listContacts", async () => ({ body: { ok: true } }), { resolveKey: async () => key, rateLimit: allow });
    expect(response.status).toBe(200);
    expect(domain.runIdempotent).not.toHaveBeenCalled();
  });

  it("lets a per-business key name its own business and refuses any other", async () => {
    const own = await handleApiRequest(request("/contacts", { headers: { authorization: "Bearer lsk_x", "lobbystack-business": businessA.toUpperCase() } }), "listContacts", async () => ({ body: { ok: true } }), { resolveKey: async () => key, rateLimit: allow });
    expect(own.status).toBe(200);
    const handler = vi.fn();
    const other = await handleApiRequest(request("/contacts", { headers: { authorization: "Bearer lsk_x", "LobbyStack-Business": businessB } }), "listContacts", handler, { resolveKey: async () => key, rateLimit: allow });
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({ error: { code: "forbidden", message: expect.stringContaining("another business") } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a LobbyStack-Business header that is not a business id", async () => {
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: "Bearer lsk_x", "LobbyStack-Business": "acme" } }), "listContacts", vi.fn(), { resolveKey: async () => key, rateLimit: allow });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "invalid_request", message: expect.any(String), details: [{ path: "LobbyStack-Business", message: "Must be a UUID." }] } });
  });
});

describe("platform keys in the v1 request pipeline", () => {
  const token = `lsp_1a2b3c4d_${"x".repeat(32)}`;
  const platformKey: ResolvedPlatformKey = { platformKeyId: "8b0c3f8e-1d2a-4b5c-9e6f-7a8b9c0d1e2f", prefix: "lsp_1a2b3c4d", name: "AlloPlace CLI", partnerId: "alloplace", ownerEmail: "ops@alloplace.example", access: "partner", scopes: ["contacts:read", "contacts:write"], createdAt: "2026-10-11T20:00:00.000Z" };
  const ownerId = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";

  function platform(init: { scopes?: ResolvedPlatformKey["scopes"]; owner?: string | null; requireBusiness?: () => Promise<void>; rateLimit?: typeof allow } = {}) {
    return {
      resolveKey: vi.fn(async () => { throw new Error("A platform key must not reach the per-business key lookup."); }),
      resolvePlatformKey: vi.fn(() => ({ ...platformKey, ...(init.scopes ? { scopes: init.scopes } : {}) })),
      resolvePlatformOwner: vi.fn(async () => (init.owner === undefined ? ownerId : init.owner)),
      requirePlatformBusiness: vi.fn(init.requireBusiness ?? (async () => undefined)),
      rateLimit: vi.fn(init.rateLimit ?? allow),
    };
  }

  beforeEach(() => { vi.clearAllMocks(); });

  it("acts on the header's business as the key's owner, with its partner", async () => {
    const dependencies = platform();
    const handler = vi.fn(async (_input: unknown) => ({ body: { data: [] } }));
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: `Bearer ${token}`, "LobbyStack-Business": businessB } }), "listContacts", handler, dependencies);
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      caller: { businessId: businessB, platformKeyId: platformKey.platformKeyId, partnerId: "alloplace", actingUserId: ownerId, actor: "platform_key" },
      credential: expect.objectContaining({ kind: "platform_key", partnerId: "alloplace" }),
    }));
    expect(dependencies.resolvePlatformKey).toHaveBeenCalledWith(token);
    expect(dependencies.resolveKey).not.toHaveBeenCalled();
    expect(dependencies.resolvePlatformOwner).toHaveBeenCalledWith("ops@alloplace.example");
    expect(dependencies.requirePlatformBusiness).toHaveBeenCalledWith({ businessId: businessB, partnerId: "alloplace", access: "partner" });
    expect(dependencies.rateLimit).toHaveBeenCalledWith(`platform:${platformKey.platformKeyId}`);
  });

  it("logs the key id, partner and business, never the key", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await handleApiRequest(request("/contacts", { headers: { authorization: `Bearer ${token}`, "LobbyStack-Business": businessB } }), "listContacts", async () => ({ body: {} }), platform());
      const line = log.mock.calls.map(([value]) => String(value)).find((value) => value.includes("public_api.request"));
      expect(JSON.parse(line!)).toMatchObject({ event: "public_api.request", operation: "listContacts", status: 200, platform_key_id: platformKey.platformKeyId, partner_id: "alloplace", business_id: businessB });
      expect(line).not.toContain(token);
    } finally {
      log.mockRestore();
    }
  });

  it("requires the LobbyStack-Business header", async () => {
    const dependencies = platform();
    const handler = vi.fn();
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: `Bearer ${token}` } }), "listContacts", handler, dependencies);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "business_required" } });
    expect(handler).not.toHaveBeenCalled();
    expect(dependencies.requirePlatformBusiness).not.toHaveBeenCalled();
  });

  it("answers GET /me without a business", async () => {
    const handler = vi.fn(async (_input: unknown) => ({ body: { data: {} } }));
    const response = await handleApiRequest(request("/me", { headers: { authorization: `Bearer ${token}` } }), "getMe", handler, platform());
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ caller: null, credential: expect.objectContaining({ kind: "platform_key" }) }));
  });

  it("answers 404 for a business the key cannot act on", async () => {
    const handler = vi.fn();
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: `Bearer ${token}`, "LobbyStack-Business": businessB } }), "listContacts", handler, platform({ requireBusiness: async () => { throw new PublicApiError(404, "not_found", "Business not found."); } }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found", message: "Business not found." } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a key whose owner has no LobbyStack account", async () => {
    const dependencies = platform({ owner: null });
    const handler = vi.fn();
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: `Bearer ${token}`, "LobbyStack-Business": businessB } }), "listContacts", handler, dependencies);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "key_owner_inactive" } });
    expect(handler).not.toHaveBeenCalled();
    expect(dependencies.requirePlatformBusiness).not.toHaveBeenCalled();
  });

  it("enforces the scope each operation declares", async () => {
    const response = await handleApiRequest(request("/calls", { headers: { authorization: `Bearer ${token}`, "LobbyStack-Business": businessB } }), "listCalls", vi.fn(), platform());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "insufficient_scope", message: expect.stringContaining("calls:read") } });
  });

  it("answers 401 for a key that is not configured", async () => {
    const dependencies = { ...platform(), resolvePlatformKey: vi.fn(() => null) };
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: `Bearer ${token}`, "LobbyStack-Business": businessB } }), "listContacts", vi.fn(), dependencies);
    expect(response.status).toBe(401);
    expect(dependencies.resolveKey).not.toHaveBeenCalled();
  });

  it("answers 500 and reports it when PLATFORM_API_KEYS is malformed", async () => {
    const dependencies = { ...platform(), resolvePlatformKey: vi.fn(() => { throw new PlatformKeyConfigError("PLATFORM_API_KEYS is not valid JSON."); }) };
    const response = await handleApiRequest(request("/contacts", { headers: { authorization: `Bearer ${token}`, "LobbyStack-Business": businessB } }), "listContacts", vi.fn(), dependencies);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "internal_error" } });
    await vi.waitFor(() => expect(reporting.reportServerError).toHaveBeenCalledWith(expect.any(PlatformKeyConfigError), expect.objectContaining({ operation: "public_api.listContacts" })));
  });

  it("keeps idempotency records per platform key and business", async () => {
    domain.runIdempotent.mockImplementation(async (_context, _scope, _hash, run) => ({ replayed: false, response: await run({ db: {} }) }));
    try {
      for (const businessId of [businessA, businessB]) {
        const response = await handleApiRequest(request("/contacts", { method: "POST", body: JSON.stringify({ phone: "+14165550134" }), headers: { authorization: `Bearer ${token}`, "LobbyStack-Business": businessId, "idempotency-key": "retry-1" } }), "createContact", async () => ({ body: { data: { id: "c1" } } }), platform());
        expect(response.status).toBe(201);
      }
      // The same Idempotency-Key on two businesses gets two records, so neither blocks the other.
      expect(domain.runIdempotent.mock.calls.map(([, scope]) => scope)).toEqual([
        { businessId: businessA, apiKeyId: `platform:${platformKey.platformKeyId}:${businessA}`, operation: "createContact", key: "retry-1" },
        { businessId: businessB, apiKeyId: `platform:${platformKey.platformKeyId}:${businessB}`, operation: "createContact", key: "retry-1" },
      ]);
    } finally {
      domain.runIdempotent.mockReset();
    }
  });

  it("lets only platform keys call an operation that acts on no one business", async () => {
    const handler = vi.fn();
    const keyWithEverything: ResolvedApiKey = { ...key, scopes: ["business:read", "businesses:create"] };
    const response = await handleApiRequest(request("/businesses", { method: "POST", headers: { authorization: "Bearer lsk_x", "idempotency-key": "k" } }), "createBusiness", handler, { resolveKey: async () => keyWithEverything, rateLimit: allow });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden", message: expect.stringContaining("Only platform keys") } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("gives a business-less operation the key, its owner and the Idempotency-Key, and ignores LobbyStack-Business", async () => {
    const dependencies = platform({ scopes: ["businesses:create"] });
    const handler = vi.fn(async (_input: unknown) => ({ status: 201, body: { data: { id: "b1" } }, headers: { "Idempotent-Replayed": "true" } }));
    const response = await handleApiRequest(request("/businesses", { method: "POST", body: "{}", headers: { authorization: `Bearer ${token}`, "idempotency-key": "onboard-acme", "LobbyStack-Business": "not-a-uuid" } }), "createBusiness", handler, dependencies);
    expect(response.status).toBe(201);
    expect(response.headers.get("idempotent-replayed")).toBe("true");
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ actingUserId: ownerId, idempotencyKey: "onboard-acme", credential: expect.objectContaining({ kind: "platform_key", partnerId: "alloplace" }) }));
    expect(dependencies.requirePlatformBusiness).not.toHaveBeenCalled();
    expect(domain.runIdempotent).not.toHaveBeenCalled();
  });

  it("requires an Idempotency-Key where the operation says so", async () => {
    const handler = vi.fn();
    const response = await handleApiRequest(request("/businesses", { method: "POST", body: "{}", headers: { authorization: `Bearer ${token}` } }), "createBusiness", handler, platform({ scopes: ["businesses:create"] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "invalid_request", message: expect.stringContaining("Idempotency-Key"), details: [{ path: "Idempotency-Key", message: "Required." }] } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps serving per-business keys when PLATFORM_API_KEYS is malformed", async () => {
    vi.stubEnv("PLATFORM_API_KEYS", "{not json");
    try {
      const response = await handleApiRequest(request("/contacts", { headers: { authorization: "Bearer lsk_x" } }), "listContacts", async () => ({ body: { ok: true } }), { resolveKey: async () => key, rateLimit: allow });
      expect(response.status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
