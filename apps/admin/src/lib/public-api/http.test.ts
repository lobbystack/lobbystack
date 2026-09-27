import { beforeEach, describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({
  beginIdempotentRequest: vi.fn(),
  completeIdempotentRequest: vi.fn(),
  releaseIdempotentRequest: vi.fn(),
  touchApiKeyLastUsed: vi.fn(async () => undefined),
}));

vi.mock("../domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("../error-reporting", () => ({ reportServerError: vi.fn() }));
// Only the public API modules are loaded; the rest of @lobbystack/domain is not needed here.
vi.mock("@lobbystack/domain", async () => ({
  ...(await import("../../../../../packages/domain/src/server/publicApi/errors")),
  ...(await import("../../../../../packages/domain/src/server/publicApi/apiKeys")),
  ...(await import("../../../../../packages/domain/src/server/publicApi/idempotency")),
  ...domain,
}));

import { PublicApiError, type ResolvedApiKey } from "@lobbystack/domain";

import { handleApiRequest } from "./http";

const businessA = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
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

  it("stores the first response for an Idempotency-Key and replays it", async () => {
    domain.beginIdempotentRequest.mockResolvedValueOnce({ kind: "new" });
    const handler = vi.fn(async () => ({ body: { data: { id: "c1" } } }));
    const init = { method: "POST", body: JSON.stringify({ phone: "+14165550134" }), headers: { authorization: "Bearer lsk_x", "idempotency-key": "retry-1" } };
    const first = await handleApiRequest(request("/contacts", init), "createContact", handler, { resolveKey: async () => key, rateLimit: allow });
    expect(first.status).toBe(201);
    expect(domain.completeIdempotentRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: "retry-1", apiKeyId: key.apiKeyId, operation: "createContact" }), expect.any(String), { status: 201, body: JSON.stringify({ data: { id: "c1" } }) });

    domain.beginIdempotentRequest.mockResolvedValueOnce({ kind: "replay", response: { status: 201, body: JSON.stringify({ data: { id: "c1" } }) } });
    const replay = await handleApiRequest(request("/contacts", init), "createContact", handler, { resolveKey: async () => key, rateLimit: allow });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(await replay.json()).toEqual({ data: { id: "c1" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("frees the Idempotency-Key after a server error", async () => {
    domain.beginIdempotentRequest.mockResolvedValueOnce({ kind: "new" });
    const response = await handleApiRequest(request("/contacts", { method: "POST", body: "{}", headers: { authorization: "Bearer lsk_x", "idempotency-key": "retry-2" } }), "createContact", async () => { throw new Error("boom"); }, { resolveKey: async () => key, rateLimit: allow });
    expect(response.status).toBe(500);
    expect(domain.releaseIdempotentRequest).toHaveBeenCalled();
    expect(domain.completeIdempotentRequest).not.toHaveBeenCalled();
  });

  it("ignores Idempotency-Key on operations that do not create things", async () => {
    const response = await handleApiRequest(request("/appointments/x/cancel", { method: "POST", headers: { authorization: "Bearer lsk_x", "idempotency-key": "k" } }), "listContacts", async () => ({ body: { ok: true } }), { resolveKey: async () => key, rateLimit: allow });
    expect(response.status).toBe(200);
    expect(domain.beginIdempotentRequest).not.toHaveBeenCalled();
  });
});
