import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { apiOperations } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({
  resolveApiKey: vi.fn(),
  touchApiKeyLastUsed: vi.fn(async () => undefined),
  getAvailabilityForApi: vi.fn(),
  getCallForApi: vi.fn(),
  getContactForApi: vi.fn(),
  updateContactForApi: vi.fn(),
  cancelAppointmentForApi: vi.fn(),
  getWebhookEndpoint: vi.fn(),
  listCallsForApi: vi.fn(async () => ({ data: [], next_cursor: null, has_more: false })),
  listContactsForApi: vi.fn(async () => ({ data: [], next_cursor: null, has_more: false })),
}));

vi.mock("../domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("../error-reporting", () => ({ reportServerError: vi.fn() }));
vi.mock("@lobbystack/domain", async () => ({
  ...(await import("../../../../../packages/domain/src/server/publicApi/errors")),
  ...(await import("../../../../../packages/domain/src/server/publicApi/idempotency")),
  bearerToken: (await import("../../../../../packages/domain/src/server/publicApi/apiKeys")).bearerToken,
  ...domain,
}));

import { v1 } from "./routes";

const apiRoot = fileURLToPath(new URL("../../../app/api/v1/", import.meta.url));
const everyScope = [...new Set(Object.values(apiOperations).map((operation) => operation.scope))];

function routeFiles(directory = apiRoot, prefix = ""): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = `${directory}${entry}`;
    if (statSync(full).isDirectory()) return routeFiles(`${full}/`, `${prefix}/${entry}`);
    return entry === "route.ts" && !prefix.includes("[...path]") ? [prefix] : [];
  });
}

function call(path: string, init: RequestInit = {}) {
  return new Request(`https://app.example.com/api/v1${path}`, { ...init, headers: { authorization: "Bearer lsk_12345678_abcdefghijklmnopqrstuvwxyzABCDEF", ...(init.headers ?? {}) } });
}

beforeEach(() => {
  vi.clearAllMocks();
  domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: everyScope });
});

describe("v1 method handling", () => {
  it("answers unsupported methods on every v1 route with a 405 v1 error and an Allow header", async () => {
    const routes = routeFiles();
    expect(routes.length).toBeGreaterThan(15);
    for (const route of routes) {
      const routeModule = await import(/* @vite-ignore */ `${apiRoot}${route.slice(1)}/route.ts`) as Record<string, unknown>;
      const supported = Object.values(apiOperations).filter((operation) => operation.path.replace(/\{([a-z_]+)\}/g, "[$1]") === route).map((operation) => operation.method as string);
      if (route === "/openapi.json") supported.push("GET");
      for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
        expect(typeof routeModule[method], `${method} ${route}`).toBe("function");
        if (supported.includes(method)) continue;
        const response = await (routeModule[method] as () => Response)();
        expect(response.status, `${method} ${route}`).toBe(405);
        expect(response.headers.get("allow")?.split(", ")).toEqual(expect.arrayContaining([...supported, "OPTIONS"]));
        expect(await response.json()).toEqual({ error: { code: "method_not_allowed", message: expect.any(String) } });
      }
    }
  });

  it("keeps PUT /contacts in the v1 error shape", async () => {
    const { PUT } = await import("../../../app/api/v1/contacts/route");
    const response = await PUT();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST, HEAD, OPTIONS");
  });
});

describe("v1 UUID validation", () => {
  const badIds = ["------------------------------------", "not-a-uuid", "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5", "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5fz", "'; drop table calls; --"];

  it.each(badIds)("rejects service_id %j with 400 before any query", async (serviceId) => {
    const response = await v1.getAvailability(call(`/availability?service_id=${encodeURIComponent(serviceId)}&start_date=2026-09-29`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "invalid_request", message: "service_id must be a UUID.", details: [{ path: "service_id", message: "Must be a UUID." }] } });
    expect(domain.getAvailabilityForApi).not.toHaveBeenCalled();
  });

  it("requires service_id", async () => {
    const response = await v1.getAvailability(call("/availability?start_date=2026-09-29"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request", details: [{ path: "service_id", message: "Required." }] } });
  });

  it.each([
    ["call_id", () => v1.getCall(call("/calls/x"), { params: Promise.resolve({ call_id: "------------------------------------" }) }), domain.getCallForApi],
    ["contact_id", () => v1.getContact(call("/contacts/x"), { params: Promise.resolve({ contact_id: "123" }) }), domain.getContactForApi],
    ["contact_id", () => v1.updateContact(call("/contacts/x", { method: "PATCH", body: "{\"name\":\"A\"}" }), { params: Promise.resolve({ contact_id: "123" }) }), domain.updateContactForApi],
    ["appointment_id", () => v1.cancelAppointment(call("/appointments/x/cancel", { method: "POST" }), { params: Promise.resolve({ appointment_id: "abc" }) }), domain.cancelAppointmentForApi],
    ["webhook_id", () => v1.getWebhook(call("/webhooks/x"), { params: Promise.resolve({ webhook_id: "abc" }) }), domain.getWebhookEndpoint],
  ] as const)("rejects a malformed %s path id with 400", async (name, run, handler) => {
    const response = await run();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request", message: `${name} must be a UUID.` } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes a valid UUID through", async () => {
    domain.getCallForApi.mockResolvedValue({ id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f" });
    const response = await v1.getCall(call("/calls/x"), { params: Promise.resolve({ call_id: "5D0BD9A4-7E1C-4A51-9A50-8E1B2C3D4E5F" }) });
    expect(response.status).toBe(200);
  });
});

describe("v1 list filters", () => {
  it("passes the call start-time range to the domain", async () => {
    const response = await v1.listCalls(call(`/calls?started_after=${encodeURIComponent("2026-09-26T00:00:00-04:00")}&started_before=2026-09-27T04:00:00Z&limit=10`));
    expect(response.status).toBe(200);
    expect(domain.listCallsForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { limit: 10, startedAfter: new Date("2026-09-26T04:00:00.000Z"), startedBefore: new Date("2026-09-27T04:00:00.000Z") });
  });

  it("rejects a start time that is not a timestamp", async () => {
    const response = await v1.listCalls(call("/calls?started_after=yesterday"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request", message: "started_after must be an ISO 8601 timestamp." } });
    expect(domain.listCallsForApi).not.toHaveBeenCalled();
  });

  it("passes a trimmed name search to the domain and ignores an empty one", async () => {
    await v1.listContacts(call("/contacts?name=%20whit%20"));
    expect(domain.listContactsForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ name: "whit" }));
    await v1.listContacts(call("/contacts?name=%20%20"));
    expect(domain.listContactsForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ name: undefined }));
  });

  it("limits the name search to 200 characters", async () => {
    const response = await v1.listContacts(call(`/contacts?name=${"a".repeat(201)}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request", details: [{ path: "name" }] } });
  });

  it("documents the new filters in the contract", () => {
    expect(apiOperations.listCalls.params.map((param) => param.name)).toEqual(expect.arrayContaining(["started_after", "started_before"]));
    expect(apiOperations.listContacts.params.map((param) => param.name)).toContain("name");
  });
});
