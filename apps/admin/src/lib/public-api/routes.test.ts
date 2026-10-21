import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { apiOperations, PLATFORM_USER_INVITATIONS_PER_DAY } from "@lobbystack/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageProvider = vi.hoisted(() => ({ name: "storage" }));
const domain = vi.hoisted(() => ({
  resolveApiKey: vi.fn(),
  touchApiKeyLastUsed: vi.fn(async () => undefined),
  getAvailabilityForApi: vi.fn(),
  getCallForApi: vi.fn(),
  getContactForApi: vi.fn(),
  updateContactForApi: vi.fn(),
  setContactPasscodesForApi: vi.fn(async (): Promise<unknown[]> => []),
  generateContactPasscodesForApi: vi.fn(),
  cancelAppointmentForApi: vi.fn(),
  getWebhookEndpoint: vi.fn(),
  createWebhookEndpoint: vi.fn(),
  updateWebhookEndpoint: vi.fn(),
  listCallsForApi: vi.fn(async () => ({ data: [], next_cursor: null, has_more: false })),
  listContactsForApi: vi.fn(async () => ({ data: [], next_cursor: null, has_more: false })),
  listStaffForApi: vi.fn(),
  getMeForApi: vi.fn(),
  getPlatformMeForApi: vi.fn(),
  createBusinessForApi: vi.fn(),
  invitedUserEmail: vi.fn((body: { email: string }) => body.email.trim().toLowerCase()),
  inviteUserForApi: vi.fn(),
  listBusinessesForApi: vi.fn(),
  updateBusinessForApi: vi.fn(),
  createKnowledgeSourceForApi: vi.fn(),
  expandKnowledgeSourceForApi: vi.fn(),
  retryKnowledgeSourceForApi: vi.fn(),
  cancelKnowledgeSourceForApi: vi.fn(),
  createKnowledgeUploadForApi: vi.fn(),
  completeKnowledgeUploadForApi: vi.fn(),
  listKnowledgeSourcesForApi: vi.fn(),
  getKnowledgeSourceForApi: vi.fn(),
  updateKnowledgeSourceForApi: vi.fn(),
  deleteKnowledgeSourceForApi: vi.fn(async () => undefined),
  listServicesForApi: vi.fn(async () => []),
  createServiceForApi: vi.fn(),
  updateServiceForApi: vi.fn(),
  deleteServiceForApi: vi.fn(async () => undefined),
  getBillingForApi: vi.fn(),
  updateBillingForApi: vi.fn(),
  createCheckoutForApi: vi.fn(),
  getCheckoutForApi: vi.fn(),
  setManagedPlanForApi: vi.fn(),
  endManagedPlanForApi: vi.fn(),
  listRulesForApi: vi.fn(async (): Promise<unknown[]> => []),
  createRuleForApi: vi.fn(),
  updateRuleForApi: vi.fn(),
  deleteRuleForApi: vi.fn(async () => undefined),
  reorderRulesForApi: vi.fn(async (): Promise<unknown[]> => []),
  getReceptionistForApi: vi.fn(),
  updateReceptionistForApi: vi.fn(),
  listKnowledgeEntriesForApi: vi.fn(),
  getKnowledgeEntryForApi: vi.fn(),
  updateKnowledgeEntryForApi: vi.fn(),
  deleteKnowledgeEntryForApi: vi.fn(async () => undefined),
  listAppointmentsForApi: vi.fn(),
  resolvePlatformKeyOwner: vi.fn(async () => "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6"),
  requirePlatformBusinessAccess: vi.fn(async () => undefined),
  resolveActingUserId: vi.fn(async () => "6a1f0c2d-8e3b-4c5d-9e6f-7a8b9c0d1e2f"),
  listPhoneNumbersForApi: vi.fn(async (): Promise<unknown[]> => []),
  searchPhoneNumbersForApi: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  claimPhoneNumberForApi: vi.fn(),
  getPhoneNumberClaimForApi: vi.fn(),
  releasePhoneNumberForApi: vi.fn(),
  getOnboardingForApi: vi.fn(),
  updateOnboardingForApi: vi.fn(),
  completeOnboardingForApi: vi.fn(),
  getTeamForApi: vi.fn(),
  createTeamInvitationForApi: vi.fn(),
  revokeTeamInvitationForApi: vi.fn(async () => undefined),
  updateTeamMemberForApi: vi.fn(),
  removeTeamMemberForApi: vi.fn(async () => undefined),
  createClaimLinkForApi: vi.fn(),
  listWidgetKeysForApi: vi.fn(async (): Promise<unknown[]> => []),
  createWidgetKeyForApi: vi.fn(),
  updateWidgetKeyForApi: vi.fn(),
  createCalendarConnectLinkForApi: vi.fn(),
  listCalendarConnectionsForApi: vi.fn(async (): Promise<unknown[]> => []),
  listAccountCalendarsForApi: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  updateCalendarConnectionForApi: vi.fn(),
  deleteCalendarConnectionForApi: vi.fn(async () => undefined),
  getNotificationPreferencesForApi: vi.fn(),
  updateNotificationPreferencesForApi: vi.fn(),
  // Requests with an Idempotency-Key run the handler once, as the real store does for a new key.
  runIdempotent: vi.fn(async (context: unknown, _scope: unknown, _hash: string, run: (transactional: unknown) => Promise<{ status: number; body: unknown }>) => ({ replayed: false, response: await run(context) })),
}));
const numbers = vi.hoisted(() => ({
  provider: { listAvailablePhoneNumbers: vi.fn() },
  searchLimit: vi.fn(async (): Promise<{ allowed: true } | { allowed: false; status: 429 | 503; reason: string }> => ({ allowed: true })),
}));

const appContext = vi.hoisted(() => ({ db: "app" }));
vi.mock("../domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }), createDomainContext: () => appContext }));
vi.mock("../error-reporting", () => ({ reportServerError: vi.fn() }));
vi.mock("../storage", () => ({ getStorageProvider: () => storageProvider }));
// CI runs these tests with a real Redis, where every file's requests share one key's per-minute budget; the limiter has its own tests.
vi.mock("./rate-limit", async (importOriginal) => ({ ...(await importOriginal<typeof import("./rate-limit")>()), enforceApiRateLimit: vi.fn(async () => ({ allowed: true, limit: 120, remaining: 119, resetAt: Math.ceil(Date.now() / 60_000) * 60 })) }));
vi.mock("../twilio-provider", () => ({ getTwilioProvider: () => numbers.provider, getNumberClaimTokenSecret: () => "number-claim-secret" }));
vi.mock("../phone-number-search-limit", () => ({ checkPhoneNumberSearchLimit: numbers.searchLimit }));
const phones = vi.hoisted(() => ({ verified: vi.fn(async (_userId: string) => true) }));
vi.mock("../verified-phone", () => ({ hasVerifiedPhone: phones.verified }));
vi.mock("../auth", () => ({ getAuthDatabase: () => ({ db: "auth" }) }));
vi.mock("../databases", () => ({ getDatabase: (role: string) => ({ db: role }) }));
const invites = vi.hoisted(() => ({ limit: vi.fn(async (): Promise<{ allowed: true } | { allowed: false; status: 429 | 503; reason: string }> => ({ allowed: true })) }));
vi.mock("../fixed-window-limit", () => ({ enforceFixedWindow: invites.limit, fixedWindowLimit: (...args: unknown[]) => args }));
const mail = vi.hoisted(() => ({ allowed: vi.fn(async (_input: unknown) => undefined), RateLimit: class EmailVerificationRateLimitError extends Error {} }));
vi.mock("../email-verification-policy", () => ({ assertEmailVerificationSendAllowed: mail.allowed, EmailVerificationRateLimitError: mail.RateLimit }));
vi.mock("@lobbystack/domain", async () => ({
  ...(await import("../../../../../packages/domain/src/server/publicApi/errors")),
  ...(await import("../../../../../packages/domain/src/server/publicApi/idempotency")),
  ...(await import("../../../../../packages/domain/src/server/publicApi/platformKeys")),
  bearerToken: (await import("../../../../../packages/domain/src/server/publicApi/apiKeys")).bearerToken,
  ...domain,
}));

import { generatePlatformKey } from "@lobbystack/domain";

import { verifyCalendarConnectLinkToken } from "../google-calendar-oauth";
import { v1 } from "./routes";

const apiRoot = fileURLToPath(new URL("../../../app/api/v1/", import.meta.url));
const everyScope = [...new Set(Object.values(apiOperations).flatMap((operation) => (operation.scope ? [operation.scope] : [])))];

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

describe("contact PINs", () => {
  const ana = "06d9c0dc-f18a-4cc6-a987-ac4963c87113";
  const milan = "3f0f6f2e-7c1a-4b8e-9a5d-2c3b4a5d6e7f";
  const contact = { id: ana, name: "Ana", phone: "+14165550134", email: null, locale: "en", timezone: null, passcode: { set_at: "2026-10-13T21:00:00.000Z", locked: false }, created_at: "2026-10-11T12:00:00.000Z", updated_at: "2026-10-11T12:00:00.000Z" };
  const setPins = (body: unknown, headers: Record<string, string> = {}) => v1.setContactPasscodes(call("/contacts/passcodes", { method: "POST", headers, body: JSON.stringify(body) }));
  const generate = (body: unknown, headers: Record<string, string> = {}) => v1.generateContactPasscodes(call("/contacts/passcodes/generate", { method: "POST", headers, body: JSON.stringify(body) }));
  const one = (passcode: unknown) => ({ passcodes: [{ contact_id: ana, passcode }] });

  it("sets and removes PINs in one request and answers with the contacts as a list", async () => {
    const contacts = [contact, { ...contact, id: milan, name: "Milan", passcode: null }];
    domain.setContactPasscodesForApi.mockResolvedValue(contacts);
    const body = { passcodes: [{ contact_id: ana, passcode: "480613" }, { contact_id: milan, passcode: null }] };
    const response = await setPins(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: contacts, next_cursor: null, has_more: false });
    expect(domain.setContactPasscodesForApi).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f" }), body);
  });

  it("refuses a PIN the dashboard would refuse, before the domain sees it", async () => {
    for (const bad of [
      one("123"), one("123456789"), one("12a4"), one(" 480613"), one(480613), one("1111"), one("123456"), one("9876"),
      { passcodes: [] },
      { passcodes: Array.from({ length: 101 }, () => ({ contact_id: ana, passcode: "480613" })) },
      { passcodes: [{ contact_id: "x", passcode: "480613" }] },
      { passcodes: [{ contact_id: ana }] },
      { passcodes: [{ contact_id: ana, passcode: "480613", name: "Ana" }] },
    ]) expect((await setPins(bad)).status, JSON.stringify(bad)).toBe(400);
    expect(await (await setPins(one("1234"))).json()).toEqual({ error: { code: "invalid_request", message: "The request body is invalid.", details: [{ path: "passcodes.0.passcode", message: "Too easy to guess: avoid one digit repeated or digits in a row, such as 1111 or 1234." }] } });
    expect(domain.setContactPasscodesForApi).not.toHaveBeenCalled();
  });

  it("gives out new PINs in a response no cache may keep", async () => {
    const generated = { contacts: [{ ...contact, new_passcode: "480613" }], remaining: 4 };
    domain.generateContactPasscodesForApi.mockResolvedValue(generated);
    const named = await generate({ contact_ids: [ana], length: 6 });
    expect(named.status).toBe(200);
    expect(named.headers.get("cache-control")).toBe("no-store");
    expect(await named.json()).toEqual({ data: generated });
    expect(domain.generateContactPasscodesForApi).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f" }), { contact_ids: [ana], length: 6 });
    expect((await generate({})).status).toBe(200);
    expect(domain.generateContactPasscodesForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), {});
    for (const bad of [{ length: 3 }, { length: 9 }, { length: 4.5 }, { length: "6" }, { contact_ids: [] }, { contact_ids: ["x"] }, { contact_ids: Array.from({ length: 101 }, () => ana) }, { all: true }]) {
      expect((await generate(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(domain.generateContactPasscodesForApi).toHaveBeenCalledTimes(2);
  });

  it("never keeps a PIN in an idempotency record", async () => {
    domain.generateContactPasscodesForApi.mockResolvedValue({ contacts: [], remaining: 0 });
    expect((await setPins(one("480613"), { "Idempotency-Key": "pins-1" })).status).toBe(200);
    expect((await generate({}, { "Idempotency-Key": "pins-2" })).status).toBe(200);
    expect(domain.runIdempotent).not.toHaveBeenCalled();
    expect(apiOperations.setContactPasscodes).not.toHaveProperty("idempotent");
    expect(apiOperations.generateContactPasscodes).not.toHaveProperty("idempotent");
  });

  it("needs contacts:write", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["contacts:read"] });
    expect((await setPins(one("480613"))).status).toBe(403);
    expect((await generate({})).status).toBe(403);
    expect(domain.setContactPasscodesForApi).not.toHaveBeenCalled();
    expect(domain.generateContactPasscodesForApi).not.toHaveBeenCalled();
  });
});

describe("GET /staff", () => {
  it("requires business:read", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["appointments:write"] });
    const response = await v1.listStaff(call("/staff"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "insufficient_scope", message: expect.stringContaining("business:read") } });
    expect(domain.listStaffForApi).not.toHaveBeenCalled();
  });

  it("returns every staff member on one page, scoped to the key's business", async () => {
    const member = { id: "06d9c0dc-f18a-4cc6-a987-ac4963c87113", name: "Sam", active: true, timezone: "UTC", service_ids: [], created_at: "2026-09-27T12:00:00.000Z", updated_at: "2026-09-27T12:00:00.000Z" };
    domain.listStaffForApi.mockResolvedValue([member]);
    const response = await v1.listStaff(call("/staff"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [member], next_cursor: null, has_more: false });
    expect(domain.listStaffForApi).toHaveBeenCalledWith(expect.anything(), { businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6" });
  });

  it("rejects a malformed staff_id on GET /availability with 400", async () => {
    const response = await v1.getAvailability(call("/availability?service_id=5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f&start_date=2026-09-29&staff_id=nope"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request", message: "staff_id must be a UUID." } });
    expect(domain.getAvailabilityForApi).not.toHaveBeenCalled();
  });
});

describe("knowledge sources", () => {
  const sourceId = "06d9c0dc-f18a-4cc6-a987-ac4963c87113";
  const source = { id: sourceId, type: "website", title: "https://maple.example/", url: "https://maple.example/", status: "processing", error: null, active: true, page_limit: 10, created_at: "2026-10-11T12:00:00.000Z", updated_at: "2026-10-11T12:00:00.000Z" };

  it("starts reading a website and answers 202 with the source", async () => {
    domain.createKnowledgeSourceForApi.mockResolvedValue(source);
    const response = await v1.createKnowledgeSource(call("/knowledge/sources", { method: "POST", body: JSON.stringify({ type: "website", url: " maple.example " }) }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: source });
    expect(domain.createKnowledgeSourceForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { type: "website", url: "maple.example" });
  });

  it("takes only websites for now", async () => {
    const response = await v1.createKnowledgeSource(call("/knowledge/sources", { method: "POST", body: JSON.stringify({ type: "file", url: "https://maple.example" }) }));
    expect(response.status).toBe(400);
    expect(domain.createKnowledgeSourceForApi).not.toHaveBeenCalled();
  });

  it.each([
    ["expand", () => v1.expandKnowledgeSource, () => domain.expandKnowledgeSourceForApi, 202],
    ["retry", () => v1.retryKnowledgeSource, () => domain.retryKnowledgeSourceForApi, 202],
    ["cancel", () => v1.cancelKnowledgeSource, () => domain.cancelKnowledgeSourceForApi, 200],
  ] as const)("%s passes the source id to the domain", async (action, route, operation, status) => {
    operation().mockResolvedValue(source);
    const response = await route()(call(`/knowledge/sources/${sourceId}/${action}`, { method: "POST" }), { params: Promise.resolve({ source_id: sourceId }) });
    expect(response.status).toBe(status);
    expect(operation()).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f" }), sourceId);
    const malformed = await route()(call("/knowledge/sources/x/expand", { method: "POST" }), { params: Promise.resolve({ source_id: "x" }) });
    expect(malformed.status).toBe(400);
  });

  it("reserves an upload with the storage provider and checks the request first", async () => {
    const upload = { upload_id: sourceId, upload_url: "https://storage.example/put", upload_headers: { "content-type": "application/pdf" }, expires_at: "2026-10-11T12:15:00.000Z" };
    domain.createKnowledgeUploadForApi.mockResolvedValue(upload);
    const body = { file_name: "prices.pdf", content_type: "application/pdf", length: 2048, checksum_sha256: `${"A".repeat(43)}=` };
    const response = await v1.createKnowledgeUpload(call("/knowledge/uploads", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: upload });
    expect(domain.createKnowledgeUploadForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), body, storageProvider);
    for (const bad of [{ ...body, content_type: "application/zip" }, { ...body, length: 10 * 1024 * 1024 + 1 }, { ...body, checksum_sha256: "nope" }, { ...body, file_name: ".." }]) {
      expect((await v1.createKnowledgeUpload(call("/knowledge/uploads", { method: "POST", body: JSON.stringify(bad) }))).status).toBe(400);
    }
    expect(domain.createKnowledgeUploadForApi).toHaveBeenCalledTimes(1);
  });

  it("completes an upload by its id and answers 202 with the file source", async () => {
    domain.completeKnowledgeUploadForApi.mockResolvedValue({ ...source, type: "file", url: null, page_limit: null, status: "pending" });
    const response = await v1.completeKnowledgeUpload(call(`/knowledge/uploads/${sourceId}/complete`, { method: "POST", body: JSON.stringify({ title: "Price list" }) }), { params: Promise.resolve({ upload_id: sourceId }) });
    expect(response.status).toBe(202);
    expect(domain.completeKnowledgeUploadForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), sourceId, { title: "Price list" }, storageProvider);
    const malformed = await v1.completeKnowledgeUpload(call("/knowledge/uploads/x/complete", { method: "POST", body: "{}" }), { params: Promise.resolve({ upload_id: "x" }) });
    expect(malformed.status).toBe(400);
  });

  it("needs knowledge:write", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:read"] });
    const response = await v1.expandKnowledgeSource(call(`/knowledge/sources/${sourceId}/expand`, { method: "POST" }), { params: Promise.resolve({ source_id: sourceId }) });
    expect(response.status).toBe(403);
    expect(domain.expandKnowledgeSourceForApi).not.toHaveBeenCalled();
  });

  it("lists sources by type and status, and refuses values it doesn't know", async () => {
    domain.listKnowledgeSourcesForApi.mockResolvedValue({ data: [source], next_cursor: null, has_more: false });
    const response = await v1.listKnowledgeSources(call("/knowledge/sources?type=page&status=indexed"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [source], next_cursor: null, has_more: false });
    expect(domain.listKnowledgeSourcesForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ type: "page", status: "indexed" }));
    expect((await v1.listKnowledgeSources(call("/knowledge/sources?type=video"))).status).toBe(400);
    expect((await v1.listKnowledgeSources(call("/knowledge/sources?status=done"))).status).toBe(400);
    expect(domain.listKnowledgeSourcesForApi).toHaveBeenCalledTimes(1);
  });

  it("reads, turns off and deletes a source by its id", async () => {
    const params = { params: Promise.resolve({ source_id: sourceId }) };
    domain.getKnowledgeSourceForApi.mockResolvedValue(source);
    expect(await (await v1.getKnowledgeSource(call(`/knowledge/sources/${sourceId}`), params)).json()).toEqual({ data: source });
    domain.updateKnowledgeSourceForApi.mockResolvedValue({ ...source, active: false });
    const updated = await v1.updateKnowledgeSource(call(`/knowledge/sources/${sourceId}`, { method: "PATCH", body: JSON.stringify({ active: false }) }), { params: Promise.resolve({ source_id: sourceId }) });
    expect(updated.status).toBe(200);
    expect(domain.updateKnowledgeSourceForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), sourceId, { active: false });
    // Only active can change on a source.
    for (const bad of [{ title: "Prices" }, {}]) {
      expect((await v1.updateKnowledgeSource(call(`/knowledge/sources/${sourceId}`, { method: "PATCH", body: JSON.stringify(bad) }), { params: Promise.resolve({ source_id: sourceId }) })).status).toBe(400);
    }
    const deleted = await v1.deleteKnowledgeSource(call(`/knowledge/sources/${sourceId}`, { method: "DELETE" }), { params: Promise.resolve({ source_id: sourceId }) });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ data: { id: sourceId, deleted: true } });
    expect(domain.deleteKnowledgeSourceForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), sourceId);
  });
});

describe("knowledge entries", () => {
  const entryId = "3f0f6f2e-7c1a-4b8e-9a5d-2c3b4a5d6e7f";
  const entry = { id: entryId, type: "faq", title: "Do you park?", content: "Behind the building.", tags: [], priority: 0, active: true, created_at: "2026-10-11T12:00:00.000Z", updated_at: "2026-10-11T12:00:00.000Z" };
  const params = () => ({ params: Promise.resolve({ entry_id: entryId }) });

  it("lists entries by type", async () => {
    domain.listKnowledgeEntriesForApi.mockResolvedValue({ data: [entry], next_cursor: null, has_more: false });
    const response = await v1.listKnowledgeEntries(call("/knowledge?type=faq"));
    expect(response.status).toBe(200);
    expect(domain.listKnowledgeEntriesForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ type: "faq" }));
    expect((await v1.listKnowledgeEntries(call("/knowledge?type=website"))).status).toBe(400);
  });

  it("edits the fields sent and checks them first", async () => {
    domain.updateKnowledgeEntryForApi.mockResolvedValue({ ...entry, title: "Is there parking?", priority: 5 });
    const response = await v1.updateKnowledgeEntry(call(`/knowledge/${entryId}`, { method: "PATCH", body: JSON.stringify({ title: " Is there parking? ", priority: 5, tags: ["parking"] }) }), params());
    expect(response.status).toBe(200);
    expect(domain.updateKnowledgeEntryForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), entryId, { title: "Is there parking?", priority: 5, tags: ["parking"] });
    for (const bad of [{ title: "" }, { priority: 101 }, { priority: 1.5 }, { type: "text" }, { question: "Parking?" }]) {
      expect((await v1.updateKnowledgeEntry(call(`/knowledge/${entryId}`, { method: "PATCH", body: JSON.stringify(bad) }), params())).status).toBe(400);
    }
    expect(domain.updateKnowledgeEntryForApi).toHaveBeenCalledTimes(1);
  });

  it("reads and deletes an entry by its id", async () => {
    domain.getKnowledgeEntryForApi.mockResolvedValue(entry);
    expect(await (await v1.getKnowledgeEntry(call(`/knowledge/${entryId}`), params())).json()).toEqual({ data: entry });
    const deleted = await v1.deleteKnowledgeEntry(call(`/knowledge/${entryId}`, { method: "DELETE" }), params());
    expect(await deleted.json()).toEqual({ data: { id: entryId, deleted: true } });
    expect((await v1.getKnowledgeEntry(call("/knowledge/sources"), { params: Promise.resolve({ entry_id: "sources" }) })).status).toBe(400);
  });

  it("refuses a malformed id before it reaches the domain", async () => {
    const entry = () => ({ params: Promise.resolve({ entry_id: "x" }) });
    const source = () => ({ params: Promise.resolve({ source_id: "x" }) });
    expect((await v1.updateKnowledgeEntry(call("/knowledge/x", { method: "PATCH", body: JSON.stringify({ active: true }) }), entry())).status).toBe(400);
    expect((await v1.deleteKnowledgeEntry(call("/knowledge/x", { method: "DELETE" }), entry())).status).toBe(400);
    expect((await v1.getKnowledgeSource(call("/knowledge/sources/x"), source())).status).toBe(400);
    expect((await v1.updateKnowledgeSource(call("/knowledge/sources/x", { method: "PATCH", body: JSON.stringify({ active: true }) }), source())).status).toBe(400);
    expect((await v1.deleteKnowledgeSource(call("/knowledge/sources/x", { method: "DELETE" }), source())).status).toBe(400);
    for (const operation of [domain.updateKnowledgeEntryForApi, domain.deleteKnowledgeEntryForApi, domain.getKnowledgeSourceForApi, domain.updateKnowledgeSourceForApi, domain.deleteKnowledgeSourceForApi]) expect(operation).not.toHaveBeenCalled();
  });

  it("needs knowledge:read to read and knowledge:write to change", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["knowledge:write"] });
    expect((await v1.listKnowledgeEntries(call("/knowledge"))).status).toBe(403);
    expect((await v1.getKnowledgeSource(call(`/knowledge/sources/${entryId}`), { params: Promise.resolve({ source_id: entryId }) })).status).toBe(403);
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["knowledge:read"] });
    expect((await v1.deleteKnowledgeEntry(call(`/knowledge/${entryId}`, { method: "DELETE" }), params())).status).toBe(403);
    expect(domain.listKnowledgeEntriesForApi).not.toHaveBeenCalled();
    expect(domain.getKnowledgeSourceForApi).not.toHaveBeenCalled();
    expect(domain.deleteKnowledgeEntryForApi).not.toHaveBeenCalled();
  });
});

describe("services", () => {
  const serviceId = "3f0f6f2e-7c1a-4b8e-9a5d-2c3b4a5d6e7f";
  const staffId = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
  const service = { id: serviceId, name: "Cut", slug: "cut", description: null, duration_minutes: 30, active: true, staff_ids: [], created_at: "2026-10-11T12:00:00.000Z", updated_at: "2026-10-11T12:00:00.000Z" };
  const params = (id = serviceId) => ({ params: Promise.resolve({ service_id: id }) });

  it("lists turned-off services only when asked", async () => {
    expect((await v1.listServices(call("/services"))).status).toBe(200);
    expect(domain.listServicesForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { includeInactive: undefined });
    await v1.listServices(call("/services?include_inactive=true"));
    expect(domain.listServicesForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { includeInactive: true });
    await v1.listServices(call("/services?include_inactive=false"));
    expect(domain.listServicesForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { includeInactive: false });
    expect((await v1.listServices(call("/services?include_inactive=yes"))).status).toBe(400);
  });

  it("adds a service with checked fields and answers 201", async () => {
    domain.createServiceForApi.mockResolvedValue(service);
    const response = await v1.createService(call("/services", { method: "POST", body: JSON.stringify({ name: " Cut ", slug: " Cut ", duration_minutes: 30, staff_ids: [staffId] }) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: service });
    expect(domain.createServiceForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { name: "Cut", slug: "cut", duration_minutes: 30, staff_ids: [staffId] });
    for (const bad of [{ name: "Cut" }, { name: "Cut", duration_minutes: 0 }, { name: "Cut", duration_minutes: 1_441 }, { name: "Cut", duration_minutes: 30.5 }, { name: "", duration_minutes: 30 }, { name: "Cut", duration_minutes: 30, slug: "cut here" }, { name: "Cut", duration_minutes: 30, staff_ids: ["x"] }, { name: "Cut", duration_minutes: 30, price: 10 }]) {
      expect((await v1.createService(call("/services", { method: "POST", body: JSON.stringify(bad) }))).status, JSON.stringify(bad)).toBe(400);
    }
    expect(domain.createServiceForApi).toHaveBeenCalledTimes(1);
  });

  it("changes and deletes a service by its id", async () => {
    domain.updateServiceForApi.mockResolvedValue({ ...service, active: false });
    const updated = await v1.updateService(call(`/services/${serviceId}`, { method: "PATCH", body: JSON.stringify({ active: false, description: null }) }), params());
    expect(updated.status).toBe(200);
    expect(domain.updateServiceForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), serviceId, { active: false, description: null });
    const deleted = await v1.deleteService(call(`/services/${serviceId}`, { method: "DELETE" }), params());
    expect(await deleted.json()).toEqual({ data: { id: serviceId, deleted: true } });
    expect(domain.deleteServiceForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), serviceId);
    expect((await v1.updateService(call("/services/x", { method: "PATCH", body: JSON.stringify({ active: true }) }), params("x"))).status).toBe(400);
    expect((await v1.deleteService(call("/services/x", { method: "DELETE" }), params("x"))).status).toBe(400);
    expect(domain.updateServiceForApi).toHaveBeenCalledTimes(1);
    expect(domain.deleteServiceForApi).toHaveBeenCalledTimes(1);
  });

  it("needs business:write to change services", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:read"] });
    expect((await v1.createService(call("/services", { method: "POST", body: JSON.stringify({ name: "Cut", duration_minutes: 30 }) }))).status).toBe(403);
    expect((await v1.deleteService(call(`/services/${serviceId}`, { method: "DELETE" }), params())).status).toBe(403);
    expect((await v1.updateService(call(`/services/${serviceId}`, { method: "PATCH", body: JSON.stringify({ active: false }) }), params())).status).toBe(403);
    expect(domain.updateServiceForApi).not.toHaveBeenCalled();
    expect(domain.createServiceForApi).not.toHaveBeenCalled();
    expect(domain.deleteServiceForApi).not.toHaveBeenCalled();
  });
});

describe("billing", () => {
  const billing = { plan: "free_cloud", managed: false, subscription_state: null, billing_interval: null, current_period_end: null, spending_cap_cents: null, overage_spend_cents: 0, spending_cap_reached: false };
  const checkoutId = "3f0f6f2e-7c1a-4b8e-9a5d-2c3b4a5d6e7f";
  const platformKey = () => generatePlatformKey({ name: "Operator", partner: "lobbystack", ownerEmail: "ops@example.com", access: "all" });

  it("reads the plan and sets the spending cap", async () => {
    domain.getBillingForApi.mockResolvedValue(billing);
    expect(await (await v1.getBilling(call("/billing"))).json()).toEqual({ data: billing });
    domain.updateBillingForApi.mockResolvedValue({ ...billing, spending_cap_cents: 5_000 });
    expect((await v1.updateBilling(call("/billing", { method: "PATCH", body: JSON.stringify({ spending_cap_cents: 5_000 }) }))).status).toBe(200);
    expect(domain.updateBillingForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { spending_cap_cents: 5_000 });
    for (const bad of [{}, { spending_cap_cents: -1 }, { spending_cap_cents: 1.5 }, { plan: "pro" }]) {
      expect((await v1.updateBilling(call("/billing", { method: "PATCH", body: JSON.stringify(bad) }))).status, JSON.stringify(bad)).toBe(400);
    }
    expect(domain.updateBillingForApi).toHaveBeenCalledTimes(1);
  });

  it("starts a checkout only for a plan and interval this deployment sells", async () => {
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar-token");
    vi.stubEnv("POLAR_ORGANIZATION_ID", "org");
    vi.stubEnv("POLAR_PRO_MONTHLY_PRODUCT_ID", "prod_pro_monthly");
    try {
      domain.createCheckoutForApi.mockResolvedValue({ id: checkoutId, plan: "pro", interval: "monthly", status: "pending", checkout_url: null, error: null, paid: false, created_at: "2026-10-11T12:00:00.000Z", updated_at: "2026-10-11T12:00:00.000Z" });
      expect((await v1.createCheckout(call("/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "pro", interval: "monthly" }) }))).status).toBe(202);
      expect(domain.createCheckoutForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { plan: "pro", interval: "monthly" }, { available: true });
      await v1.createCheckout(call("/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "pro", interval: "annual" }) }));
      expect(domain.createCheckoutForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { plan: "pro", interval: "annual" }, { available: false });
      expect((await v1.createCheckout(call("/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "enterprise", interval: "monthly" }) }))).status).toBe(400);
      domain.getCheckoutForApi.mockResolvedValue({ id: checkoutId });
      expect((await v1.getCheckout(call(`/billing/checkout/${checkoutId}`), { params: Promise.resolve({ checkout_id: checkoutId }) })).status).toBe(200);
      expect((await v1.getCheckout(call("/billing/checkout/x"), { params: Promise.resolve({ checkout_id: "x" }) })).status).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("lets only an operator's platform key manage a plan outside Polar", async () => {
    // A per-business key, even with billing:manage, is refused.
    expect((await v1.setManagedPlan(call("/billing/managed-plan", { method: "POST", body: JSON.stringify({ plan: "enterprise" }) }))).status).toBe(403);
    expect((await v1.endManagedPlan(call("/billing/managed-plan", { method: "DELETE" }))).status).toBe(403);
    // So is a partner's platform key.
    const partner = generatePlatformKey({ name: "Partner", partner: "acme", ownerEmail: "ops@acme.example", access: "partner" });
    const operator = platformKey();
    vi.stubEnv("PLATFORM_API_KEYS", JSON.stringify([partner.entry, operator.entry]));
    try {
      const asKey = (key: string, init: RequestInit = {}) => new Request("https://app.example.com/api/v1/billing/managed-plan", { ...init, headers: { authorization: `Bearer ${key}`, "LobbyStack-Business": "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f" } });
      expect((await v1.setManagedPlan(asKey(partner.key, { method: "POST", body: JSON.stringify({ plan: "enterprise" }) }))).status).toBe(403);
      domain.setManagedPlanForApi.mockResolvedValue({ ...billing, plan: "enterprise", managed: true });
      const set = await v1.setManagedPlan(asKey(operator.key, { method: "POST", body: JSON.stringify({ plan: "enterprise" }) }));
      expect(set.status).toBe(200);
      expect(await set.json()).toMatchObject({ data: { plan: "enterprise", managed: true } });
      expect((await v1.setManagedPlan(asKey(operator.key, { method: "POST", body: JSON.stringify({ plan: "pro" }) }))).status).toBe(400);
      domain.endManagedPlanForApi.mockResolvedValue(billing);
      expect((await v1.endManagedPlan(asKey(operator.key, { method: "DELETE" }))).status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(domain.setManagedPlanForApi).toHaveBeenCalledTimes(1);
    expect(domain.endManagedPlanForApi).toHaveBeenCalledTimes(1);
  });

  it("needs billing:manage", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:write"] });
    expect((await v1.getBilling(call("/billing"))).status).toBe(403);
    expect((await v1.createCheckout(call("/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "pro", interval: "monthly" }) }))).status).toBe(403);
    expect(domain.getBillingForApi).not.toHaveBeenCalled();
    expect(domain.createCheckoutForApi).not.toHaveBeenCalled();
  });
});

describe("phone numbers", () => {
  const actingUserId = "6a1f0c2d-8e3b-4c5d-9e6f-7a8b9c0d1e2f";
  const numberId = "8c2b7f4e-1d3a-4e5b-9c6d-0e1f2a3b4c5d";
  const claimId = "4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8";
  const offer = { phone_number: "+14165550123", country: "CA", kind: "local", locality: "Toronto", region: "ON", capabilities: { voice: true, sms: true }, offer_token: "signed-offer", expires_at: "2026-10-11T12:05:00.000Z" };
  const claim = { id: claimId, status: "pending", phone_number: "+14165550123", phone_number_id: null, replaces_phone_number_id: null, error: null, created_at: "2026-10-11T12:00:00.000Z", updated_at: "2026-10-11T12:00:00.000Z" };
  const search = (body: unknown) => v1.searchPhoneNumbers(call("/phone-numbers/search", { method: "POST", body: JSON.stringify(body) }));
  const claimWith = (body: unknown, headers: Record<string, string> = { "Idempotency-Key": "claim-1" }) => v1.createPhoneNumberClaim(call("/phone-numbers/claims", { method: "POST", headers, body: JSON.stringify(body) }));

  it("searches as the account the key acts as, counting against that account's limit just before the carrier is asked", async () => {
    // As the domain does: its checks first, then beforeSearch, then the carrier.
    const asked = vi.fn();
    domain.searchPhoneNumbersForApi.mockImplementation(async (...args: unknown[]) => {
      await (args[3] as { beforeSearch?: () => Promise<void> }).beforeSearch?.();
      asked();
      return [offer];
    });
    const response = await search({ area_code: "416", limit: 5 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [offer], next_cursor: null, has_more: false });
    expect(numbers.searchLimit).toHaveBeenCalledWith({ userId: actingUserId, initial: false });
    expect(domain.searchPhoneNumbersForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { area_code: "416", limit: 5 }, { userId: actingUserId, provider: numbers.provider, claimTokenSecret: "number-claim-secret", beforeSearch: expect.any(Function) });

    numbers.searchLimit.mockResolvedValueOnce({ allowed: false, status: 429, reason: "rate_limit_user" });
    const limited = await search({});
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: "rate_limited" } });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(limited.headers.get("retry-after"))).toBeLessThanOrEqual(600);
    numbers.searchLimit.mockResolvedValueOnce({ allowed: false, status: 503, reason: "rate_limit_unavailable" });
    const unavailable = await search({});
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("5");
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it("checks the search before it counts against the limit", async () => {
    for (const bad of [{ country: "FR" }, { kind: "landline" }, { area_code: "41a" }, { limit: 0 }, { limit: 21 }, { replaces: "x" }, { areaCode: "416" }]) {
      expect((await search(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(numbers.searchLimit).not.toHaveBeenCalled();
    expect(domain.searchPhoneNumbersForApi).not.toHaveBeenCalled();
  });

  it("claims an offer only with an Idempotency-Key, as the account the key acts as", async () => {
    domain.claimPhoneNumberForApi.mockResolvedValue(claim);
    expect((await claimWith({ offer_token: "signed-offer" }, {})).status).toBe(400);
    expect((await claimWith({ offer_token: "" })).status).toBe(400);
    const response = await claimWith({ offer_token: "signed-offer" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: claim });
    expect(domain.claimPhoneNumberForApi).toHaveBeenCalledTimes(1);
    // No network hash: customers of one integration platform share its addresses, and would block each other's trials.
    expect(domain.claimPhoneNumberForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { offerToken: "signed-offer" }, { userId: actingUserId, claimTokenSecret: "number-claim-secret" });
  });

  it("replaces a number with a replacement offer", async () => {
    domain.claimPhoneNumberForApi.mockResolvedValue({ ...claim, replaces_phone_number_id: numberId });
    const replace = (id: string, headers: Record<string, string> = { "Idempotency-Key": "replace-1" }) => v1.replacePhoneNumber(call(`/phone-numbers/${id}/replace`, { method: "POST", headers, body: JSON.stringify({ offer_token: "signed-offer" }) }), { params: Promise.resolve({ phone_number_id: id }) });
    expect((await replace(numberId)).status).toBe(202);
    expect(domain.claimPhoneNumberForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { offerToken: "signed-offer", replaces: numberId }, { userId: actingUserId, claimTokenSecret: "number-claim-secret" });
    expect((await replace("x")).status).toBe(400);
    expect((await replace(numberId, {})).status).toBe(400);
    expect(domain.claimPhoneNumberForApi).toHaveBeenCalledTimes(1);
    // The same key and body sent to another number is a different request, so it can't replay this one.
    const otherId = "9d3c8a5f-2e4b-4f6c-8d7e-1f2a3b4c5d6e";
    await replace(otherId);
    const hashes = domain.runIdempotent.mock.calls.map(([, , hash]) => hash);
    expect(hashes.at(-1)).not.toBe(hashes[0]);
  });

  it("lists numbers, reads claims and releases a number", async () => {
    const number = { id: numberId, phone_number: "+14165550123", status: "active", release_scheduled_at: null, created_at: "2026-10-11T12:00:00.000Z", updated_at: "2026-10-11T12:00:00.000Z" };
    domain.listPhoneNumbersForApi.mockResolvedValue([number]);
    expect(await (await v1.listPhoneNumbers(call("/phone-numbers"))).json()).toEqual({ data: [number], next_cursor: null, has_more: false });
    domain.getPhoneNumberClaimForApi.mockResolvedValue(claim);
    expect((await v1.getPhoneNumberClaim(call(`/phone-numbers/claims/${claimId}`), { params: Promise.resolve({ claim_id: claimId }) })).status).toBe(200);
    expect((await v1.getPhoneNumberClaim(call("/phone-numbers/claims/x"), { params: Promise.resolve({ claim_id: "x" }) })).status).toBe(400);
    domain.releasePhoneNumberForApi.mockResolvedValue({ ...number, release_scheduled_at: "2026-10-11T12:01:00.000Z" });
    const released = await v1.releasePhoneNumber(call(`/phone-numbers/${numberId}`, { method: "DELETE" }), { params: Promise.resolve({ phone_number_id: numberId }) });
    expect(released.status).toBe(202);
    expect(domain.releasePhoneNumberForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), numberId);
  });

  it("needs phone_numbers:manage", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:write", "billing:manage"] });
    expect((await search({})).status).toBe(403);
    expect((await claimWith({ offer_token: "signed-offer" })).status).toBe(403);
    expect((await v1.listPhoneNumbers(call("/phone-numbers"))).status).toBe(403);
    expect(domain.searchPhoneNumbersForApi).not.toHaveBeenCalled();
    expect(domain.claimPhoneNumberForApi).not.toHaveBeenCalled();
    expect(domain.listPhoneNumbersForApi).not.toHaveBeenCalled();
  });
});

describe("onboarding", () => {
  const onboarding = { stage: "website", complete: false, checklist: [{ id: "greeting", status: "missing", required: true }], missing: ["greeting"] };
  const complete = (body: unknown, init: RequestInit = {}) => v1.completeOnboarding(call("/onboarding/complete", { method: "POST", body: JSON.stringify(body), ...init }));

  it("reads progress and skips setup steps", async () => {
    domain.getOnboardingForApi.mockResolvedValue(onboarding);
    expect(await (await v1.getOnboarding(call("/onboarding"))).json()).toEqual({ data: onboarding });
    domain.updateOnboardingForApi.mockResolvedValue(onboarding);
    expect((await v1.updateOnboarding(call("/onboarding", { method: "PATCH", body: JSON.stringify({ skip_steps: ["test_call", "full_site_read"] }) }))).status).toBe(200);
    expect(domain.updateOnboardingForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { skip_steps: ["test_call", "full_site_read"] });
    for (const bad of [{}, { skip_steps: ["greeting"] }, { skip_steps: "test_call" }, { skip_steps: [], extra: true }]) {
      expect((await v1.updateOnboarding(call("/onboarding", { method: "PATCH", body: JSON.stringify(bad) }))).status, JSON.stringify(bad)).toBe(400);
    }
    expect(domain.updateOnboardingForApi).toHaveBeenCalledTimes(1);
  });

  it("finishes onboarding, crediting a referral only through the app's own database role", async () => {
    domain.completeOnboardingForApi.mockResolvedValue({ ...onboarding, stage: "complete", complete: true, missing: [] });
    expect((await complete({ source: "podcast", skip_number: true })).status).toBe(200);
    expect(domain.completeOnboardingForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { source: "podcast", skip_number: true }, { attribution: undefined });
    expect(domain.resolveActingUserId).not.toHaveBeenCalled();
    expect((await complete({ referral_code: "friend" })).status).toBe(200);
    expect(domain.completeOnboardingForApi).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { referral_code: "friend" }, { attribution: { context: appContext, referredUserId: "6a1f0c2d-8e3b-4c5d-9e6f-7a8b9c0d1e2f" } });
    for (const bad of [{ source: "x".repeat(121) }, { skip_number: "yes" }, { referral_code: "" }, { stage: "complete" }]) {
      expect((await complete(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(domain.completeOnboardingForApi).toHaveBeenCalledTimes(2);
  });

  it("keeps platform keys from crediting referrals", async () => {
    const partner = generatePlatformKey({ name: "Partner", partner: "acme", ownerEmail: "ops@acme.example", access: "partner" });
    vi.stubEnv("PLATFORM_API_KEYS", JSON.stringify([partner.entry]));
    try {
      const response = await v1.completeOnboarding(new Request("https://app.example.com/api/v1/onboarding/complete", { method: "POST", headers: { authorization: `Bearer ${partner.key}`, "LobbyStack-Business": "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f" }, body: JSON.stringify({ referral_code: "acme" }) }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "invalid_request", details: [{ path: "referral_code" }] } });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(domain.completeOnboardingForApi).not.toHaveBeenCalled();
  });

  it("reads with business:read and changes with business:write", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:read"] });
    domain.getOnboardingForApi.mockResolvedValue(onboarding);
    expect((await v1.getOnboarding(call("/onboarding"))).status).toBe(200);
    expect((await complete({})).status).toBe(403);
    expect((await v1.updateOnboarding(call("/onboarding", { method: "PATCH", body: JSON.stringify({ skip_steps: [] }) }))).status).toBe(403);
    expect(domain.completeOnboardingForApi).not.toHaveBeenCalled();
  });
});

describe("team", () => {
  const actingUserId = "6a1f0c2d-8e3b-4c5d-9e6f-7a8b9c0d1e2f";
  const membershipId = "8c2b7f4e-1d3a-4e5b-9c6d-0e1f2a3b4c5d";
  const invitation = { id: "4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8", email: "sam@example.com", role: "scheduler", status: "pending", transfers_ownership: false, expires_at: "2026-10-18T12:00:00.000Z", created_at: "2026-10-11T12:00:00.000Z" };
  const post = (path: string, body: unknown, headers: Record<string, string> = { "Idempotency-Key": `key-${path}` }) => call(path, { method: "POST", headers, body: JSON.stringify(body) });
  // As the domain does: the request is checked first, then beforeSend counts it.
  const sends = async (...args: unknown[]) => { await (args[3] as { beforeSend?: () => Promise<void> }).beforeSend?.(); return invitation; };

  it("reads the team", async () => {
    const team = { members: [{ id: membershipId, user_id: actingUserId, name: "Sam", email: "sam@example.com", role: "business_owner", joined_at: "2026-10-11T12:00:00.000Z" }], invitations: [invitation] };
    domain.getTeamForApi.mockResolvedValue(team);
    expect(await (await v1.getTeam(call("/team"))).json()).toEqual({ data: team });
  });

  it("invites as the account the key acts as, within its invitation limit", async () => {
    domain.createTeamInvitationForApi.mockImplementation(sends);
    expect((await v1.createTeamInvitation(post("/team/invitations", { email: "sam@example.com", role: "scheduler" }, {}))).status).toBe(400);
    const response = await v1.createTeamInvitation(post("/team/invitations", { email: "sam@example.com", role: "scheduler" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: invitation });
    expect(domain.createTeamInvitationForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { email: "sam@example.com", role: "scheduler" }, { userId: actingUserId, beforeSend: expect.any(Function) });
    expect(invites.limit).toHaveBeenCalledWith([["team-invite", "user-hour", actingUserId, 20, 3_600, "rate_limit_user_hour"]]);
    invites.limit.mockResolvedValueOnce({ allowed: false, status: 429, reason: "rate_limit_user_hour" });
    const limited = await v1.createTeamInvitation(post("/team/invitations", { email: "kai@example.com", role: "viewer" }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    for (const bad of [{ email: "sam@example.com", role: "business_owner" }, { role: "viewer" }, { email: "sam@example.com", role: "viewer", name: "Sam" }]) {
      expect((await v1.createTeamInvitation(post("/team/invitations", bad))).status, JSON.stringify(bad)).toBe(400);
    }
    expect(domain.createTeamInvitationForApi).toHaveBeenCalledTimes(2);
  });

  it("revokes invitations and changes or removes members by id", async () => {
    const revoked = await v1.revokeTeamInvitation(call(`/team/invitations/${invitation.id}`, { method: "DELETE" }), { params: Promise.resolve({ invitation_id: invitation.id }) });
    expect(await revoked.json()).toEqual({ data: { id: invitation.id, deleted: true } });
    domain.updateTeamMemberForApi.mockResolvedValue({ id: membershipId, role: "viewer" });
    expect((await v1.updateTeamMember(call(`/team/members/${membershipId}`, { method: "PATCH", body: JSON.stringify({ role: "viewer" }) }), { params: Promise.resolve({ membership_id: membershipId }) })).status).toBe(200);
    expect(domain.updateTeamMemberForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), membershipId, { role: "viewer" });
    expect((await v1.updateTeamMember(call(`/team/members/${membershipId}`, { method: "PATCH", body: JSON.stringify({ role: "business_owner" }) }), { params: Promise.resolve({ membership_id: membershipId }) })).status).toBe(400);
    expect((await v1.removeTeamMember(call(`/team/members/${membershipId}`, { method: "DELETE" }), { params: Promise.resolve({ membership_id: membershipId }) })).status).toBe(200);
    expect((await v1.removeTeamMember(call("/team/members/x", { method: "DELETE" }), { params: Promise.resolve({ membership_id: "x" }) })).status).toBe(400);
    expect(domain.removeTeamMemberForApi).toHaveBeenCalledTimes(1);
  });

  it("hands the business over with a claim link, under the same limit", async () => {
    domain.createClaimLinkForApi.mockImplementation(async (...args: unknown[]) => ({ invitation: { ...(await sends(...args)), role: "business_owner", transfers_ownership: true }, url: "https://app.example.com/accept-invite?token=t" }));
    const response = await v1.createClaimLink(post("/team/claim-link", { email: "owner@example.com" }, {}));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ data: { invitation: { role: "business_owner", transfers_ownership: true }, url: expect.stringContaining("accept-invite") } });
    expect(domain.createClaimLinkForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { email: "owner@example.com" }, { userId: actingUserId, beforeSend: expect.any(Function) });
    expect(invites.limit).toHaveBeenCalledTimes(1);
  });

  it("never keeps a claim link's token in an idempotency record", async () => {
    const token = "claim-token-that-hands-the-business-over";
    domain.createClaimLinkForApi.mockResolvedValue({ invitation: { ...invitation, role: "business_owner", transfers_ownership: true }, url: `https://app.example.com/accept-invite?token=${token}` });
    // An Idempotency-Key is ignored: each request runs, and nothing stores its answer.
    for (let sent = 1; sent <= 2; sent += 1) {
      const response = await v1.createClaimLink(post("/team/claim-link", { email: "owner@example.com" }, { "Idempotency-Key": "hand-over-1" }));
      expect(response.status).toBe(201);
      expect(response.headers.get("idempotent-replayed")).toBeNull();
      expect(await response.text()).toContain(token);
      expect(domain.createClaimLinkForApi).toHaveBeenCalledTimes(sent);
    }
    expect(domain.runIdempotent).not.toHaveBeenCalled();
    expect(apiOperations.createClaimLink).not.toHaveProperty("idempotent");
  });

  it("needs team:manage", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:write"] });
    expect((await v1.getTeam(call("/team"))).status).toBe(403);
    expect((await v1.createClaimLink(post("/team/claim-link", { email: "owner@example.com" }))).status).toBe(403);
    expect(domain.getTeamForApi).not.toHaveBeenCalled();
    expect(domain.createClaimLinkForApi).not.toHaveBeenCalled();
  });
});

describe("notification preferences", () => {
  const actingUserId = "6a1f0c2d-8e3b-4c5d-9e6f-7a8b9c0d1e2f";
  const settings = { email_enabled: true, sms_enabled: false, events: { voice_message: { email: true, sms: false } }, daily_summary: { enabled: false, send_time: null }, sms: { available: false, unavailable_reason: "consent_required" } };
  const update = (body: unknown) => v1.updateNotificationPreferences(call("/notification-preferences", { method: "PATCH", body: JSON.stringify(body) }));

  it("reads and changes the alerts of the account the key acts as, with the dashboard's database role", async () => {
    domain.getNotificationPreferencesForApi.mockResolvedValue(settings);
    expect(await (await v1.getNotificationPreferences(call("/notification-preferences"))).json()).toEqual({ data: settings });
    expect(domain.getNotificationPreferencesForApi).toHaveBeenCalledWith(appContext, expect.objectContaining({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f" }), { userId: actingUserId, phoneVerified: true });
    expect(phones.verified).toHaveBeenCalledWith(actingUserId);

    domain.updateNotificationPreferencesForApi.mockResolvedValue(settings);
    const change = { email_enabled: false, events: { voice_message: { email: false } }, daily_summary: { enabled: true, send_time: "08:30" } };
    expect((await update(change)).status).toBe(200);
    expect(domain.updateNotificationPreferencesForApi).toHaveBeenCalledWith(appContext, expect.anything(), change, { userId: actingUserId, phoneVerified: true });
    for (const bad of [{ events: { ai_reply_failed: { email: false } } }, { events: { voice_message: { push: true } } }, { daily_summary: { send_time: "8:30" } }, { daily_summary: { send_time: "24:00" } }, { email_enabled: "no" }, { sms_consent: true }]) {
      expect((await update(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(domain.updateNotificationPreferencesForApi).toHaveBeenCalledTimes(1);
  });

  it("reads with business:read and changes with business:write", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:read"] });
    domain.getNotificationPreferencesForApi.mockResolvedValue(settings);
    expect((await v1.getNotificationPreferences(call("/notification-preferences"))).status).toBe(200);
    expect((await update({ email_enabled: false })).status).toBe(403);
    expect(domain.updateNotificationPreferencesForApi).not.toHaveBeenCalled();
  });
});

describe("calendars", () => {
  const businessId = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
  const connectionId = "8c9d0e1f-2a3b-4c4d-8e5f-6a7b8c9d0e1f";
  const connection = { id: connectionId, provider: "google", account_id: "1234", calendar_id: null, staff_id: null, status: "connected", sync_error: null, last_synced_at: null, created_at: "2026-10-11T12:00:00.000Z", updated_at: "2026-10-11T12:00:00.000Z" };
  const google = { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REDIRECT_URI: "https://app.lobbystack.example/api/calendar/google/callback", ENCRYPTION_KEY: "calendar-test-key" };
  const setGoogle = (configured: boolean) => { for (const [name, value] of Object.entries(google)) vi.stubEnv(name, configured ? value : ""); };
  const params = (id = connectionId) => ({ params: Promise.resolve({ connection_id: id }) });
  const connect = () => v1.createCalendarConnectLink(call("/calendars/google/connect", { method: "POST" }));
  const update = (body: unknown, id = connectionId) => v1.updateCalendarConnection(call(`/calendars/${id}`, { method: "PATCH", body: JSON.stringify(body) }), params(id));
  const remove = () => v1.deleteCalendarConnection(call(`/calendars/${connectionId}`, { method: "DELETE" }), params());
  afterEach(() => vi.unstubAllEnvs());

  it("hands out a signed link to the dashboard's connect page where Google Calendar is set up", async () => {
    setGoogle(false);
    expect(await (await connect()).json()).toMatchObject({ error: { code: "forbidden" } });
    expect(domain.createCalendarConnectLinkForApi).not.toHaveBeenCalled();
    setGoogle(true);
    // The link is signed with the dashboard's auth secret.
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(await (await connect()).json()).toMatchObject({ error: { code: "forbidden" } });
    expect(domain.createCalendarConnectLinkForApi).not.toHaveBeenCalled();
    vi.stubEnv("APP_BASE_URL", "https://app.lobbystack.example/dashboard");
    vi.stubEnv("BETTER_AUTH_SECRET", "link-test-secret");
    domain.createCalendarConnectLinkForApi.mockImplementation(async (_context: unknown, _caller: unknown, options: { link: (input: { businessId: string }) => { url: string; expiresAt: Date } }) => {
      const { url, expiresAt } = options.link({ businessId });
      return { url, expires_at: expiresAt.toISOString() };
    });
    const response = await connect();
    expect(response.status).toBe(201);
    const url = new URL(((await response.json()) as { data: { url: string } }).data.url);
    expect(`${url.origin}${url.pathname}`).toBe("https://app.lobbystack.example/api/calendar/google/connect");
    expect(url.searchParams.get("businessId")).toBe(businessId);
    expect(verifyCalendarConnectLinkToken(url.searchParams.get("token")!)).toMatchObject({ businessId });
  });

  it("lists connections and an account's calendars, and checks changes before the domain sees them", async () => {
    domain.listCalendarConnectionsForApi.mockResolvedValue([connection]);
    expect(await (await v1.listCalendarConnections(call("/calendars"))).json()).toEqual({ data: [connection], next_cursor: null, has_more: false });
    const calendars = [{ id: "main@example.com", name: "Main", primary: true, writable: true, selected: false }];
    domain.listAccountCalendarsForApi.mockResolvedValue(calendars);
    expect(await (await v1.listAccountCalendars(call(`/calendars/${connectionId}/calendars`), params())).json()).toEqual({ data: calendars, next_cursor: null, has_more: false });
    expect(domain.listAccountCalendarsForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), connectionId, expect.any(Function));
    expect((await v1.listAccountCalendars(call("/calendars/x/calendars"), params("x"))).status).toBe(400);

    domain.updateCalendarConnectionForApi.mockResolvedValue({ ...connection, calendar_id: "main@example.com" });
    expect((await update({ calendar_id: " main@example.com ", staff_id: null })).status).toBe(200);
    expect(domain.updateCalendarConnectionForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), connectionId, { calendar_id: "main@example.com", staff_id: null }, expect.any(Function));
    for (const bad of [{ calendar_id: "" }, { calendar_id: "x".repeat(256) }, { staff_id: "robin" }, { selected_calendar_id: "main@example.com" }]) {
      expect((await update(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await update({ staff_id: null }, "x")).status).toBe(400);
    expect(domain.updateCalendarConnectionForApi).toHaveBeenCalledTimes(1);

    expect(await (await remove()).json()).toEqual({ data: { id: connectionId, deleted: true } });
    expect(domain.deleteCalendarConnectionForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), connectionId);
  });

  it("reaches Google only where it is set up", async () => {
    await v1.listAccountCalendars(call(`/calendars/${connectionId}/calendars`), params());
    const access = domain.listAccountCalendarsForApi.mock.calls[0]![3] as () => unknown;
    setGoogle(false);
    const refused = (() => { try { access(); } catch (error) { return error; } })();
    expect(refused).toMatchObject({ status: 403, code: "forbidden" });
    setGoogle(true);
    expect(access()).toEqual({ decryptToken: expect.any(Function), encryptToken: expect.any(Function), refreshAccessToken: expect.any(Function), listCalendars: expect.any(Function) });
  });

  it("reads with business:read and changes with business:write", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId, apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:read"] });
    expect((await v1.listCalendarConnections(call("/calendars"))).status).toBe(200);
    expect((await v1.listAccountCalendars(call(`/calendars/${connectionId}/calendars`), params())).status).toBe(200);
    expect(await (await connect()).json()).toMatchObject({ error: { code: "insufficient_scope" } });
    expect((await update({ staff_id: null })).status).toBe(403);
    expect((await remove()).status).toBe(403);
    expect(domain.createCalendarConnectLinkForApi).not.toHaveBeenCalled();
    expect(domain.updateCalendarConnectionForApi).not.toHaveBeenCalled();
    expect(domain.deleteCalendarConnectionForApi).not.toHaveBeenCalled();
  });
});

describe("widget keys", () => {
  const keyId = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";
  const widgetKey = { id: keyId, label: "Site", status: "active", allowed_origins: ["https://example.com"], config: { position: "bottom-right", title: "" }, last_used_at: null, created_at: "2026-10-11T12:00:00.000Z" };
  const create = (body: unknown) => v1.createWidgetKey(call("/widget-keys", { method: "POST", body: JSON.stringify(body) }));
  const update = (body: unknown, id = keyId) => v1.updateWidgetKey(call(`/widget-keys/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ widget_key_id: id }) });

  it("lists keys and creates one with the script tag served from the dashboard", async () => {
    domain.listWidgetKeysForApi.mockResolvedValue([widgetKey]);
    expect(await (await v1.listWidgetKeys(call("/widget-keys"))).json()).toEqual({ data: [widgetKey], next_cursor: null, has_more: false });
    // Website chat is a restricted capability, so issuing keys needs the deployment to turn it on.
    const response403 = await create({ allowed_origins: [] });
    expect(response403.status).toBe(403);
    vi.stubEnv("APP_BASE_URL", "https://app.lobbystack.example/dashboard");
    vi.stubEnv("WIDGET_KEY_ISSUANCE_ENABLED", "true");
    try {
      domain.createWidgetKeyForApi.mockResolvedValue({ ...widgetKey, key: "wk_live_x", embed_snippet: "<script></script>" });
      const response = await create({ label: "Site", allowed_origins: ["https://example.com/contact"], config: { color: "#0f766e", lead_form: { enabled: true, require_email: true } } });
      expect(response.status).toBe(201);
      expect(domain.createWidgetKeyForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { label: "Site", allowed_origins: ["https://example.com/contact"], config: { color: "#0f766e", lead_form: { enabled: true, require_email: true } } }, { appOrigin: "https://app.lobbystack.example" });
      for (const bad of [{ allowed_origins: ["javascript:alert(1)"] }, { allowed_origins: ["example.com"] }, { allowed_origins: [], config: { color: "teal" } }, { allowed_origins: [], config: { localeOverride: "fr" } }, {}]) {
        expect((await create(bad)).status, JSON.stringify(bad)).toBe(400);
      }
    } finally {
      vi.unstubAllEnvs();
    }
    expect(domain.createWidgetKeyForApi).toHaveBeenCalledTimes(1);
  });

  it("checks a key's changes before the domain sees them", async () => {
    domain.updateWidgetKeyForApi.mockResolvedValue({ ...widgetKey, status: "disabled" });
    expect((await update({ status: "disabled", label: null })).status).toBe(200);
    expect(domain.updateWidgetKeyForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), keyId, { status: "disabled", label: null });
    for (const bad of [{ status: "deleted" }, { label: "" }, { allowed_origins: ["ftp://example.com"] }, { config: { position: "top" } }]) {
      expect((await update(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await update({ status: "active" }, "x")).status).toBe(400);
    expect(domain.updateWidgetKeyForApi).toHaveBeenCalledTimes(1);
  });

  it("lists with business:read and changes with business:write", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:read"] });
    expect((await v1.listWidgetKeys(call("/widget-keys"))).status).toBe(200);
    expect((await create({ allowed_origins: [] })).status).toBe(403);
    expect((await update({ status: "disabled" })).status).toBe(403);
    expect(domain.createWidgetKeyForApi).not.toHaveBeenCalled();
  });
});

describe("rules", () => {
  const ruleId = "3f0f6f2e-7c1a-4b8e-9a5d-2c3b4a5d6e7f";
  const otherId = "06d9c0dc-f18a-4cc6-a987-ac4963c87113";
  const rule = { id: ruleId, title: "No prices", content: "Never quote prices.", active: true, created_at: "2026-10-11T12:00:00.000Z", updated_at: "2026-10-11T12:00:00.000Z" };
  const params = (id = ruleId) => ({ params: Promise.resolve({ rule_id: id }) });

  it("lists the rules and adds one with checked fields", async () => {
    domain.listRulesForApi.mockResolvedValue([rule]);
    expect(await (await v1.listRules(call("/rules"))).json()).toEqual({ data: [rule], next_cursor: null, has_more: false });
    domain.createRuleForApi.mockResolvedValue(rule);
    const created = await v1.createRule(call("/rules", { method: "POST", body: JSON.stringify({ title: " No prices ", content: "Never quote prices." }) }));
    expect(created.status).toBe(201);
    expect(domain.createRuleForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { title: "No prices", content: "Never quote prices." });
    for (const bad of [{ title: "No prices" }, { title: "", content: "x" }, { title: "x".repeat(161), content: "x" }, { title: "x", content: "x".repeat(10_001) }, { title: "x", content: "x", order: 1 }]) {
      expect((await v1.createRule(call("/rules", { method: "POST", body: JSON.stringify(bad) }))).status, JSON.stringify(bad)).toBe(400);
    }
    expect(domain.createRuleForApi).toHaveBeenCalledTimes(1);
  });

  it("changes, deletes and reorders rules by id", async () => {
    domain.updateRuleForApi.mockResolvedValue({ ...rule, active: false });
    expect((await v1.updateRule(call(`/rules/${ruleId}`, { method: "PATCH", body: JSON.stringify({ active: false }) }), params())).status).toBe(200);
    expect(domain.updateRuleForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), ruleId, { active: false });
    expect(await (await v1.deleteRule(call(`/rules/${ruleId}`, { method: "DELETE" }), params())).json()).toEqual({ data: { id: ruleId, deleted: true } });
    domain.reorderRulesForApi.mockResolvedValue([rule]);
    const reordered = await v1.reorderRules(call("/rules/reorder", { method: "POST", body: JSON.stringify({ rule_ids: [otherId, ruleId] }) }));
    expect(await reordered.json()).toEqual({ data: [rule], next_cursor: null, has_more: false });
    expect(domain.reorderRulesForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { rule_ids: [otherId, ruleId] });
    expect((await v1.reorderRules(call("/rules/reorder", { method: "POST", body: JSON.stringify({ rule_ids: [] }) }))).status).toBe(400);
    expect((await v1.reorderRules(call("/rules/reorder", { method: "POST", body: JSON.stringify({ rule_ids: ["x"] }) }))).status).toBe(400);
    expect((await v1.updateRule(call("/rules/x", { method: "PATCH", body: JSON.stringify({ active: true }) }), params("x"))).status).toBe(400);
    // A rule takes only title, content and active, and calls read at most 4,000 characters of it.
    expect((await v1.updateRule(call(`/rules/${ruleId}`, { method: "PATCH", body: JSON.stringify({ position: 2 }) }), params())).status).toBe(400);
    expect((await v1.updateRule(call(`/rules/${ruleId}`, { method: "PATCH", body: JSON.stringify({ content: "x".repeat(4_001) }) }), params())).status).toBe(400);
    expect(domain.updateRuleForApi).toHaveBeenCalledTimes(1);
    expect(domain.reorderRulesForApi).toHaveBeenCalledTimes(1);
  });

  it("needs business:read to read and business:write to change", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:read"] });
    expect((await v1.createRule(call("/rules", { method: "POST", body: JSON.stringify({ title: "x", content: "x" }) }))).status).toBe(403);
    expect((await v1.reorderRules(call("/rules/reorder", { method: "POST", body: JSON.stringify({ rule_ids: [ruleId] }) }))).status).toBe(403);
    expect((await v1.updateRule(call(`/rules/${ruleId}`, { method: "PATCH", body: JSON.stringify({ active: false }) }), params())).status).toBe(403);
    expect((await v1.deleteRule(call(`/rules/${ruleId}`, { method: "DELETE" }), params())).status).toBe(403);
    expect(domain.updateRuleForApi).not.toHaveBeenCalled();
    expect(domain.deleteRuleForApi).not.toHaveBeenCalled();
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:write"] });
    expect((await v1.listRules(call("/rules"))).status).toBe(403);
    expect(domain.createRuleForApi).not.toHaveBeenCalled();
    expect(domain.reorderRulesForApi).not.toHaveBeenCalled();
    expect(domain.listRulesForApi).not.toHaveBeenCalled();
  });
});

describe("receptionist settings", () => {
  const receptionist = { greeting: "Hi", tone: "warm", summary: "Maple", summary_source: "operator", booking_policy: "Book", voice_instructions: null, sms_instructions: null, chat_instructions: null, transfer_mode: "never", transfer_number: null, booking_mode: "instant", appointment_change_policy: { enabled: true, allow_cancel: true, allow_reschedule: true, verification_mode: "phone_match_and_facts" }, updated_at: "2026-10-11T12:00:00.000Z" };

  it("reads the settings", async () => {
    domain.getReceptionistForApi.mockResolvedValue(receptionist);
    const response = await v1.getReceptionist(call("/receptionist"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: receptionist });
  });

  it("passes the checked fields through and refuses anything the dashboard would refuse", async () => {
    domain.updateReceptionistForApi.mockResolvedValue({ ...receptionist, greeting: "Hello." });
    const response = await v1.updateReceptionist(call("/receptionist", { method: "PATCH", body: JSON.stringify({ greeting: " Hello. ", booking_mode: "request", transfer_number: "+14165550134" }) }));
    expect(response.status).toBe(200);
    expect(domain.updateReceptionistForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { greeting: "Hello.", booking_mode: "request", transfer_number: "+14165550134" });
    for (const bad of [{ transfer_mode: "sometimes" }, { summary: "Mine.", regenerate_summary: true }, { greeting: "" }, { appointment_change_policy: { enabled: false } }, { locale: "fr" }]) {
      expect((await v1.updateReceptionist(call("/receptionist", { method: "PATCH", body: JSON.stringify(bad) }))).status).toBe(400);
    }
    expect(domain.updateReceptionistForApi).toHaveBeenCalledTimes(1);
  });

  it("needs business:read to read and business:write to change", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:read"] });
    expect((await v1.updateReceptionist(call("/receptionist", { method: "PATCH", body: JSON.stringify({ greeting: "Hello." }) }))).status).toBe(403);
    domain.resolveApiKey.mockResolvedValue({ businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", apiKeyId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", scopes: ["business:write"] });
    expect((await v1.getReceptionist(call("/receptionist"))).status).toBe(403);
    expect(domain.updateReceptionistForApi).not.toHaveBeenCalled();
    expect(domain.getReceptionistForApi).not.toHaveBeenCalled();
  });
});

describe("PATCH /business", () => {
  it("passes the business type through with the other fields", async () => {
    domain.updateBusinessForApi.mockResolvedValue({});
    const response = await v1.updateBusiness(call("/business", { method: "PATCH", body: JSON.stringify({ business_type: " dental_clinic ", locale: "fr" }) }));
    expect(response.status).toBe(200);
    expect(domain.updateBusinessForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { business_type: "dental_clinic", locale: "fr" });
  });

  it("refuses an empty business type", async () => {
    const response = await v1.updateBusiness(call("/business", { method: "PATCH", body: JSON.stringify({ business_type: "  " }) }));
    expect(response.status).toBe(400);
    expect(domain.updateBusinessForApi).not.toHaveBeenCalled();
  });
});

describe("GET /me", () => {
  const me = { api_key: { id: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", name: "Zapier", prefix: "lsk_1a2b3c4d", scopes: ["knowledge:write"], created_at: "2026-09-27T12:00:00.000Z" }, business: { id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", name: "Maple Salon" } };

  it("works for a key with a single unrelated scope", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId: me.business.id, apiKeyId: me.api_key.id, scopes: ["knowledge:write"] });
    domain.getMeForApi.mockResolvedValue(me);
    const response = await v1.getMe(call("/me"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: me });
  });

  it("returns 401 for a revoked key", async () => {
    domain.resolveApiKey.mockResolvedValue(null);
    const response = await v1.getMe(call("/me"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(domain.getMeForApi).not.toHaveBeenCalled();
  });
});

describe("GET /appointments?contact_id", () => {
  it("passes a valid contact_id to the query with the other filters", async () => {
    domain.listAppointmentsForApi.mockResolvedValue({ data: [], next_cursor: null, has_more: false });
    const response = await v1.listAppointments(call("/appointments?contact_id=0cabb07b-ea18-4e9f-8f7b-356405838770&status=confirmed&starts_after=2026-09-01T00:00:00Z&limit=10"));
    expect(response.status).toBe(200);
    expect(domain.listAppointmentsForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ contactId: "0cabb07b-ea18-4e9f-8f7b-356405838770", status: "confirmed", limit: 10, startsAfter: new Date("2026-09-01T00:00:00Z") }));
  });

  it("rejects a malformed contact_id with 400", async () => {
    const response = await v1.listAppointments(call("/appointments?contact_id=abc"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request", message: "contact_id must be a UUID." } });
    expect(domain.listAppointmentsForApi).not.toHaveBeenCalled();
  });
});

describe("webhook event scopes", () => {
  const businessId = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
  const apiKeyId = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
  const endpointId = "06d9c0dc-f18a-4cc6-a987-ac4963c87113";
  const endpoint = { id: endpointId, url: "https://hooks.example.com/a", description: null, events: ["call.completed"], status: "enabled", disabled_reason: null, created_at: "2026-09-27T12:00:00.000Z", updated_at: "2026-09-27T12:00:00.000Z" };
  const post = (events: string[]) => v1.createWebhook(call("/webhooks", { method: "POST", body: JSON.stringify({ url: "https://vendor.example.com/h", events }) }));
  const patch = (body: Record<string, unknown>) => v1.updateWebhook(call("/webhooks/x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ webhook_id: endpointId }) });

  it("rejects a webhooks:manage-only key subscribing to events it cannot read", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId, apiKeyId, scopes: ["webhooks:manage"] });
    const response = await post(["call.completed", "message.taken"]);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "insufficient_scope", message: expect.stringContaining("calls:read, messages:read") } });
    expect(domain.createWebhookEndpoint).not.toHaveBeenCalled();
  });

  it("creates the endpoint when the key has the read scope", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId, apiKeyId, scopes: ["webhooks:manage", "calls:read"] });
    domain.createWebhookEndpoint.mockResolvedValue({ endpoint, secret: "whsec_x" });
    const response = await post(["call.completed"]);
    expect(response.status).toBe(201);
  });

  it("rejects moving an endpoint's url when the key cannot read its events", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId, apiKeyId, scopes: ["webhooks:manage"] });
    domain.getWebhookEndpoint.mockResolvedValue(endpoint);
    const response = await patch({ url: "https://vendor.example.com/h" });
    expect(response.status).toBe(403);
    expect(domain.updateWebhookEndpoint).not.toHaveBeenCalled();
  });

  it("lets the key change only the description without the read scope", async () => {
    domain.resolveApiKey.mockResolvedValue({ businessId, apiKeyId, scopes: ["webhooks:manage"] });
    domain.updateWebhookEndpoint.mockResolvedValue(endpoint);
    const response = await patch({ description: "Renamed" });
    expect(response.status).toBe(200);
    expect(domain.getWebhookEndpoint).not.toHaveBeenCalled();
  });
});

describe("platform keys on v1 routes", () => {
  const businessId = "9e8d7c6b-5a49-4382-a716-1f2e3d4c5b6a";
  const ownerId = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
  const { key, entry } = generatePlatformKey({ name: "AlloPlace CLI", partner: "alloplace", ownerEmail: "ops@alloplace.example", access: "all", platformScopes: ["businesses:create", "users:create"] });
  const platformCall = (path: string, init: RequestInit = {}) => new Request(`https://app.example.com/api/v1${path}`, { ...init, headers: { authorization: `Bearer ${key}`, ...(init.headers ?? {}) } });

  beforeEach(() => { vi.stubEnv("PLATFORM_API_KEYS", JSON.stringify([entry])); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("answers GET /me without a business, showing the key's partner and access", async () => {
    const me = { api_key: { id: entry.id, name: "AlloPlace CLI", prefix: entry.prefix, scopes: [], created_at: entry.created_at }, business: null, platform: { partner: "alloplace", access: "all" } };
    domain.getPlatformMeForApi.mockResolvedValue(me);
    const response = await v1.getMe(platformCall("/me"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: me });
    expect(domain.getPlatformMeForApi).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "platform_key", platformKeyId: entry.id, partnerId: "alloplace", access: "all" }), null);
    expect(domain.resolveApiKey).not.toHaveBeenCalled();
    expect(domain.requirePlatformBusinessAccess).not.toHaveBeenCalled();
  });

  it("passes the header's business to GET /me", async () => {
    domain.getPlatformMeForApi.mockResolvedValue({});
    const response = await v1.getMe(platformCall("/me", { headers: { "LobbyStack-Business": businessId } }));
    expect(response.status).toBe(200);
    expect(domain.requirePlatformBusinessAccess).toHaveBeenCalledWith(expect.anything(), { businessId, partnerId: "alloplace", access: "all" });
    expect(domain.getPlatformMeForApi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { businessId, platformKeyId: entry.id, partnerId: "alloplace", actingUserId: ownerId, actor: "platform_key" });
  });

  it("acts on the header's business on every other route", async () => {
    const response = await v1.listStaff(platformCall("/staff", { headers: { "LobbyStack-Business": businessId } }));
    expect(response.status).toBe(200);
    expect(domain.listStaffForApi).toHaveBeenCalledWith(expect.anything(), { businessId, platformKeyId: entry.id, partnerId: "alloplace", actingUserId: ownerId, actor: "platform_key" });
    const missing = await v1.listStaff(platformCall("/staff"));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: { code: "business_required" } });
  });

  it("manages webhooks as the platform key, not as an api_keys row", async () => {
    const endpoint = { id: "06d9c0dc-f18a-4cc6-a987-ac4963c87113", url: "https://hooks.example.com/a", description: null, events: ["call.completed"], status: "enabled", disabled_reason: null, created_at: "2026-09-27T12:00:00.000Z", updated_at: "2026-09-27T12:00:00.000Z" };
    domain.createWebhookEndpoint.mockResolvedValue({ endpoint, secret: "whsec_x" });
    const response = await v1.createWebhook(platformCall("/webhooks", { method: "POST", headers: { "LobbyStack-Business": businessId }, body: JSON.stringify({ url: "https://vendor.example.com/h", events: ["call.completed"] }) }));
    expect(response.status).toBe(201);
    expect(domain.createWebhookEndpoint).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businessId, manager: { kind: "platform_key", platformKeyId: entry.id, partnerId: "alloplace", actingUserId: ownerId } }));
  });

  it("refuses a platform key that is not configured", async () => {
    vi.stubEnv("PLATFORM_API_KEYS", "");
    const response = await v1.getMe(platformCall("/me"));
    expect(response.status).toBe(401);
    expect(domain.getPlatformMeForApi).not.toHaveBeenCalled();
  });

  describe("POST /users", () => {
    const invitation = { email: "owner@acmeplumbing.ca", locale: "fr" };
    const post = (body: unknown, headers: Record<string, string> = { "Idempotency-Key": "owner-acme" }) => v1.createUser(platformCall("/users", { method: "POST", headers, body: JSON.stringify(body) }));
    beforeEach(() => vi.stubEnv("APP_BASE_URL", "https://app.lobbystack.example/dashboard"));

    it("builds the email's link from APP_BASE_URL, never from the request's host, and sends nothing without it", async () => {
      domain.inviteUserForApi.mockResolvedValue(invitation);
      const spoofed = new Request("https://attacker.example/api/v1/users", { method: "POST", headers: { authorization: `Bearer ${key}`, "Idempotency-Key": "owner-acme", host: "attacker.example" }, body: JSON.stringify({ email: "owner@acmeplumbing.ca" }) });
      expect((await v1.createUser(spoofed)).status).toBe(202);
      expect(domain.inviteUserForApi).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ appBaseUrl: "https://app.lobbystack.example" }));
      domain.inviteUserForApi.mockClear();
      invites.limit.mockClear();
      vi.stubEnv("APP_BASE_URL", "");
      expect((await post({ email: "owner@acmeplumbing.ca" })).status).toBe(500);
      expect(invites.limit).not.toHaveBeenCalled();
      expect(domain.inviteUserForApi).not.toHaveBeenCalled();
    });

    it("checks the key's daily limit and the recipient's email limits, then invites with the auth and app roles", async () => {
      domain.inviteUserForApi.mockResolvedValue(invitation);
      const response = await post({ email: " owner@acmeplumbing.ca ", locale: "fr" });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ data: invitation });
      expect(invites.limit).toHaveBeenCalledWith([["platform-user-invitations", "key-day", entry.id, PLATFORM_USER_INVITATIONS_PER_DAY, 86_400, "rate_limit_key_day"]]);
      expect(mail.allowed).toHaveBeenCalledWith({ email: "owner@acmeplumbing.ca", scope: "account-setup" });
      expect(domain.inviteUserForApi).toHaveBeenCalledWith({ auth: "auth", app: "lobbystack_app" }, { key: expect.objectContaining({ kind: "platform_key", platformKeyId: entry.id }), idempotencyKey: "owner-acme", body: { email: "owner@acmeplumbing.ca", locale: "fr" }, appBaseUrl: expect.any(String) });
    });

    it("stops a key past its daily limit before any email", async () => {
      invites.limit.mockResolvedValueOnce({ allowed: false, status: 429, reason: "rate_limit_key_day" });
      const response = await post({ email: "owner@acmeplumbing.ca" });
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toMatch(/^\d+$/);
      expect(mail.allowed).not.toHaveBeenCalled();
      expect(domain.inviteUserForApi).not.toHaveBeenCalled();
    });

    it("answers as if sent, and sends nothing, while the address is on its email cooldown", async () => {
      mail.allowed.mockRejectedValueOnce(new mail.RateLimit("Please wait"));
      const response = await post({ email: "owner@acmeplumbing.ca", locale: "fr" });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ data: invitation });
      expect(domain.inviteUserForApi).not.toHaveBeenCalled();
    });

    it("refuses a request without an Idempotency-Key, an unknown field, or a per-business key", async () => {
      expect((await post({ email: "owner@acmeplumbing.ca" }, {})).status).toBe(400);
      expect((await post({ email: "owner@acmeplumbing.ca", password: "secret" })).status).toBe(400);
      const businessKey = await v1.createUser(call("/users", { method: "POST", headers: { "Idempotency-Key": "owner-acme" }, body: JSON.stringify({ email: "owner@acmeplumbing.ca" }) }));
      expect(businessKey.status).toBe(403);
      expect(domain.inviteUserForApi).not.toHaveBeenCalled();
    });
  });

  describe("POST /businesses", () => {
    const business = { id: "3f2a9c1e-5b7d-8e8a-9c21-7d4e5f6a8b90", name: "Acme Plumbing", timezone: "America/Toronto", locale: "en", website_url: null, business_type: "service_company", onboarding_stage: "website", booking_mode: "request", hours: [], created_at: "2026-10-11T21:00:00.000Z", updated_at: "2026-10-11T21:00:00.000Z" };
    const post = (body: unknown, headers: Record<string, string> = { "Idempotency-Key": "onboard-acme" }) => v1.createBusiness(platformCall("/businesses", { method: "POST", headers, body: JSON.stringify(body) }));

    it("creates the business as the key's owner, keyed by the Idempotency-Key", async () => {
      domain.createBusinessForApi.mockResolvedValue({ business, replayed: false });
      const response = await post({ name: " Acme Plumbing ", timezone: "America/Toronto" });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ data: business });
      expect(response.headers.get("idempotent-replayed")).toBeNull();
      expect(domain.createBusinessForApi).toHaveBeenCalledWith(expect.anything(), {
        key: expect.objectContaining({ kind: "platform_key", platformKeyId: entry.id, partnerId: "alloplace" }),
        actingUserId: ownerId,
        idempotencyKey: "onboard-acme",
        requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        body: { name: "Acme Plumbing", timezone: "America/Toronto" },
      });
    });

    it("marks a replayed creation", async () => {
      domain.createBusinessForApi.mockResolvedValue({ business, replayed: true });
      const response = await post({ name: "Acme Plumbing", timezone: "America/Toronto" });
      expect(response.status).toBe(201);
      expect(response.headers.get("idempotent-replayed")).toBe("true");
    });

    it("hashes the same request the same way, whatever its key order or spacing", async () => {
      domain.createBusinessForApi.mockResolvedValue({ business, replayed: false });
      await post({ name: "Acme Plumbing", timezone: "America/Toronto", locale: "fr" });
      await post({ locale: "fr", timezone: "America/Toronto", name: "  Acme Plumbing" });
      const [first, second] = domain.createBusinessForApi.mock.calls.map(([, input]) => (input as { requestHash: string }).requestHash);
      expect(second).toBe(first);
    });

    it("validates the body before creating anything", async () => {
      const response = await post({ name: "Acme", timezone: "America/Toronto", owner: "someone" });
      expect(response.status).toBe(400);
      expect(domain.createBusinessForApi).not.toHaveBeenCalled();
    });

    it("refuses a request without an Idempotency-Key", async () => {
      const response = await post({ name: "Acme", timezone: "America/Toronto" }, {});
      expect(response.status).toBe(400);
      expect(domain.createBusinessForApi).not.toHaveBeenCalled();
    });

    it("refuses a per-business key", async () => {
      const response = await v1.createBusiness(call("/businesses", { method: "POST", headers: { "Idempotency-Key": "k" }, body: JSON.stringify({ name: "Acme", timezone: "UTC" }) }));
      expect(response.status).toBe(403);
      expect(domain.createBusinessForApi).not.toHaveBeenCalled();
    });
  });

  it("lists the businesses the key's partner onboarded, a page at a time", async () => {
    domain.listBusinessesForApi.mockResolvedValue({ data: [], next_cursor: null, has_more: false });
    const response = await v1.listBusinesses(platformCall("/businesses?limit=10&cursor=abc"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [], next_cursor: null, has_more: false });
    expect(domain.listBusinessesForApi).toHaveBeenCalledWith(expect.anything(), { partnerId: "alloplace", limit: 10, cursor: "abc" });
  });
});
