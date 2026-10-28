import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("../error-reporting", () => ({ reportServerError: vi.fn(async () => undefined) }));
// CI runs these tests with a real Redis, where every file's requests share one key's per-minute budget; the limiter has its own tests.
vi.mock("../public-api/rate-limit", async (importOriginal) => ({ ...(await importOriginal<typeof import("../public-api/rate-limit")>()), enforceApiRateLimit: vi.fn(async () => ({ allowed: true, limit: 120, remaining: 119, resetAt: Math.ceil(Date.now() / 60_000) * 60 })) }));
// The phone number routes' server-only modules, which these tests never reach.
vi.mock("../twilio-provider", () => ({ getTwilioProvider: vi.fn(), getNumberClaimTokenSecret: vi.fn(), requestIpHash: vi.fn() }));
vi.mock("../phone-number-search-limit", () => ({ checkPhoneNumberSearchLimit: vi.fn() }));

const idempotency = vi.hoisted(() => ({ store: new Map<string, { hash: string; response: { status: number; body: unknown } }>() }));
// REST routes call these directly; the MCP tools get fakes through dependencies.
const rest = vi.hoisted(() => ({ resolveApiKey: vi.fn(), createAppointmentForApi: vi.fn(), createContactForApi: vi.fn() }));
vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    ...actual,
    ...rest,
    touchApiKeyLastUsed: vi.fn(async () => undefined),
    // An in-memory stand-in for runIdempotent with the same rules: one record
    // per (API key, operation, key); same hash replays, a different hash is rejected.
    runIdempotent: vi.fn(async (context: unknown, scope: { apiKeyId: string; operation: string; key: string }, hash: string, run: (transactional: unknown) => Promise<{ status: number; body: unknown }>) => {
      const id = `${scope.apiKeyId}:${scope.operation}:${scope.key}`;
      const existing = idempotency.store.get(id);
      if (existing) {
        if (existing.hash !== hash) throw new actual.PublicApiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request body.");
        return { replayed: true, response: existing.response };
      }
      const response = await run(context);
      idempotency.store.set(id, { hash, response });
      return { replayed: false, response };
    }),
  };
});

import { randomUUID } from "node:crypto";

import { PublicApiError, type ApiCaller, type PartnerPlatformKey, type ResolvedApiKey, type ResolvedOAuthGrant, type ResolvedPartnerOAuthGrant } from "@lobbystack/domain";
import { apiKeyScopes, apiOperations, type ApiKeyScope } from "@lobbystack/shared";

import type { RateLimitDecision } from "../public-api/rate-limit";
import { v1 } from "../public-api/routes";
import { createLobbyStackMcpHttpHandler } from "./handler";
import { partnerMcpOperations, partnerMcpTools, type PartnerMcpOperations } from "./partner-tools";
import type { McpPartnerPrincipal } from "./server";
import { mcpTools, type McpOperations } from "./tools";

const businessA = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
const businessB = "6e1ce0b5-8f2d-4b62-8b61-9f2c3d4e5f60";
const keyIdA = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
const keyIdB = "1c8d2e3f-4051-4b62-9c73-8d94ea5b6c7d";
const id = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const at = "2026-09-27T14:00:00.000Z";
const later = "2026-09-27T14:30:00.000Z";

const secrets: Record<string, ResolvedApiKey> = {
  lsk_aaaaaaaa_full: { businessId: businessA, apiKeyId: keyIdA, scopes: [...apiKeyScopes] },
  lsk_bbbbbbbb_full: { businessId: businessB, apiKeyId: keyIdB, scopes: [...apiKeyScopes] },
};

// OAuth access tokens, as app.resolve_oauth_access_token would return them.
const grantIdA = "8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f";
const grantUser = "9d0e1f2a-3b4c-4d5e-9f6a-8b9c0d1e2f3a";
const grants: Record<string, ResolvedOAuthGrant> = {};
let touchedGrants: string[] = [];

function grantToken(scopes: ApiKeyScope[], options: { businessId?: string; resources?: string[]; grantId?: string } = {}): string {
  const token = `lsa_${randomUUID().replace(/-/g, "")}`;
  grants[token] = { businessId: options.businessId ?? businessA, grantId: options.grantId ?? grantIdA, userId: grantUser, clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata", clientName: "Claude", scopes, resources: options.resources ?? ["http://localhost:3000/api/mcp"], expiresAt: new Date(Date.now() + 3_600_000) };
  return token;
}

function keyWith(scopes: ApiKeyScope[]): string {
  const secret = `lsk_cccccccc_${scopes.join("_")}`;
  secrets[secret] = { businessId: businessA, apiKeyId: keyIdA, scopes };
  return secret;
}

const business = { id: businessA, name: "Maple Dental", timezone: "America/Toronto", locale: "en", website_url: null, business_type: "service_company", onboarding_stage: "complete", booking_mode: "instant", hours: [{ day: "monday", open: "09:00", close: "17:00" }], created_at: at, updated_at: at };
const service = { id, name: "Cleaning", slug: "cleaning", description: null, duration_minutes: 30, active: true, staff_ids: [], created_at: at, updated_at: at };
const staffMember = { id, name: "Sam", active: true, timezone: "America/Toronto", service_ids: [id], created_at: at, updated_at: at };
const call = { id, channel: "phone", status: "completed", outcome: "message_taken", summary: "Wants a callback.", end_reason: "completed", contact_id: id, caller_name: "Ana", caller_phone: "+14165550134", duration_seconds: 42, recording_available: false, started_at: at, ended_at: later, created_at: at };
const contact = { id, name: "Ana", phone: "+14165550134", email: null, locale: "en", timezone: null, passcode: null, created_at: at, updated_at: at };
const appointment = { id, status: "confirmed", starts_at: at, ends_at: later, timezone: "America/Toronto", service_id: id, service_name: "Cleaning", staff_id: id, staff_name: "Sam", contact_id: id, contact_name: "Ana", contact_phone: "+14165550134", source: "api", calendar_sync_status: "pending", created_at: at, updated_at: at };
const message = { id, status: "open", title: "Callback", body: "Please call back.", caller_name: "Ana", callback_phone: "+14165550134", urgency: "normal", callback_window: null, channel: "voice", call_id: id, created_at: at, updated_at: at };
const knowledge = { id, type: "faq", title: "Do you park?", content: "Yes, behind the building.", tags: [], priority: 0, active: true, created_at: at, updated_at: at };
const page = <T>(data: T[]) => ({ data, next_cursor: null, has_more: false });

function fakeOperations(): McpOperations {
  return {
    getBusinessForApi: vi.fn(async () => business),
    updateBusinessForApi: vi.fn(async () => business),
    listServicesForApi: vi.fn(async () => [service]),
    listStaffForApi: vi.fn(async () => [staffMember]),
    listCallsForApi: vi.fn(async () => page([call])),
    getCallForApi: vi.fn(async () => ({ ...call, transcript: [{ speaker: "caller", text: "Hi", at }] })),
    listContactsForApi: vi.fn(async () => page([contact])),
    getContactForApi: vi.fn(async () => contact),
    createContactForApi: vi.fn(async () => contact),
    updateContactForApi: vi.fn(async () => contact),
    listAppointmentsForApi: vi.fn(async () => page([appointment])),
    getAppointmentForApi: vi.fn(async () => appointment),
    getAvailabilityForApi: vi.fn(async () => [{ starts_at: at, ends_at: later }]),
    createAppointmentForApi: vi.fn(async () => appointment),
    cancelAppointmentForApi: vi.fn(async () => ({ ...appointment, status: "cancelled" })),
    rescheduleAppointmentForApi: vi.fn(async () => appointment),
    listMessagesForApi: vi.fn(async () => page([message])),
    createKnowledgeEntryForApi: vi.fn(async () => knowledge),
  } as unknown as McpOperations;
}

// A partner, its platform keys and its people's agency grants.
const partnerId = "3a4b5c6d-7e8f-4a9b-8c0d-1e2f3a4b5c6d";
const platformKeyId = "4b5c6d7e-8f9a-4b0c-9d1e-2f3a4b5c6d7e";
const agencyGrantId = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
const agencyUser = "6d7e8f9a-0b1c-4d2e-9f3a-4b5c6d7e8f9a";
const platformKeys: Record<string, PartnerPlatformKey> = {};
const partnerGrants: Record<string, ResolvedPartnerOAuthGrant> = {};

function partnerKeyWith(scopes: ApiKeyScope[]): string {
  const secret = `lsp_${randomUUID().replace(/-/g, "").slice(0, 8)}_${randomUUID().replace(/-/g, "")}`;
  platformKeys[secret] = { platformKeyId, prefix: secret.slice(0, 12), name: "Coding assistant", group: partnerId, scopes, createdAt: at, partnerId, access: "group" };
  return secret;
}

function agencyToken(scopes: ApiKeyScope[], role: "owner" | "admin" | "member" = "admin"): string {
  const token = `lsa_${randomUUID().replace(/-/g, "")}`;
  partnerGrants[token] = { partnerId, grantId: agencyGrantId, userId: agencyUser, role, clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata", clientName: "Claude", scopes, resources: ["http://localhost:3000/api/mcp"], expiresAt: new Date(Date.now() + 3_600_000) };
  return token;
}

const partnerView = { id: partnerId, name: "Northwind", slug: "northwind", subdomain: "northwind.portal.example.test", custom_domain: null, dashboard_url: "https://northwind.portal.example.test", tier: { billed: false, slug: "free", interval: null }, pool: null };

function fakePartnerOperations(): PartnerMcpOperations {
  const fakes = Object.fromEntries(Object.keys(partnerMcpOperations).map((name) => [name, vi.fn(async () => { throw new Error(`${name} has no fake`); })])) as unknown as Record<keyof PartnerMcpOperations, ReturnType<typeof vi.fn>>;
  fakes.getPartnerForApi.mockImplementation(async () => partnerView);
  fakes.listPartnerBusinessesForApi.mockImplementation(async () => []);
  fakes.deletePartnerBusinessForApi.mockImplementation(async (_context: unknown, _subject: unknown, businessId: string) => ({ id: businessId, deleted: true }));
  fakes.createPartnerBusinessForApi.mockImplementation(async () => ({ business, replayed: false }));
  return fakes as unknown as PartnerMcpOperations;
}

const allow = async (): Promise<RateLimitDecision> => ({ allowed: true, limit: 120, remaining: 119, resetAt: 1_800_000_060 });

let operations: McpOperations;
let partnerOperations: PartnerMcpOperations;
let partnerBusinessCaller: ReturnType<typeof vi.fn<(principal: McpPartnerPrincipal, businessId: string) => Promise<ApiCaller>>>;
let rateLimit: ReturnType<typeof vi.fn<(apiKeyId: string) => Promise<RateLimitDecision>>>;
let logs: Array<Record<string, unknown>>;
let handler: (request: Request) => Promise<Response>;
const clients: Client[] = [];

beforeEach(() => {
  idempotency.store.clear();
  operations = fakeOperations();
  partnerOperations = fakePartnerOperations();
  partnerBusinessCaller = vi.fn(async (principal: McpPartnerPrincipal, businessId: string): Promise<ApiCaller> => {
    if (businessId === businessB) throw new PublicApiError(404, "not_found", "Business not found.");
    const { subject } = principal;
    return "userId" in subject
      ? { businessId, partnerId: subject.partnerId, userId: subject.userId, actor: "partner_member", mcpGrantId: subject.grantId }
      : { businessId, platformKeyId: subject.platformKeyId, groupId: subject.group, partnerId: subject.partnerId, actor: "platform_key" };
  });
  rateLimit = vi.fn(allow);
  logs = [];
  touchedGrants = [];
  handler = createLobbyStackMcpHttpHandler({
    resolveKey: async (secret) => secrets[secret] ?? null,
    touchKey: async () => undefined,
    resolveGrant: async (token) => grants[token] ?? null,
    resolvePartnerGrant: async (token) => partnerGrants[token] ?? null,
    touchGrant: async (grantId) => { touchedGrants.push(grantId); },
    resolvePlatformKey: async (secret) => platformKeys[secret] ?? null,
    touchPlatformKey: async () => undefined,
    partnerOperations,
    partnerBusinessCaller,
    partnerLimit: async () => undefined,
    partnerContext: () => ({ db: {} }) as never,
    rateLimit,
    operations,
    log: (line) => { logs.push(line); },
  });
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map(async (client) => await client.close().catch(() => undefined)));
});

const endpoint = "https://app.example.com/api/mcp";

async function connect(secret: string, mode: "legacy" | "auto" = "legacy"): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { authorization: `Bearer ${secret}` } },
    fetch: async (input, init) => await handler(new Request(input, init)),
  });
  const client = new Client({ name: "lobbystack-test", version: "1.0.0" }, { versionNegotiation: { mode } });
  await client.connect(transport);
  clients.push(client);
  return client;
}

function errorOf(result: Awaited<ReturnType<Client["callTool"]>>): { code: string; message: string } {
  expect(result.isError).toBe(true);
  const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
  return (JSON.parse(text) as { error: { code: string; message: string } }).error;
}

const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "curl", version: "1" } } };

function post(headers: Record<string, string>): Request {
  return new Request(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(initialize) });
}

describe("MCP authentication", () => {
  it("rejects a request without a key with 401 and a Bearer challenge", async () => {
    const response = await handler(post({}));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(await response.json()).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
  });

  it("rejects unknown and revoked keys with 401 invalid_token", async () => {
    const response = await handler(post({ authorization: "Bearer lsk_00000000_revoked" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("refuses the host's platform keys, which act as an account on many businesses", async () => {
    const { generatePlatformKey } = await import("../../../../../packages/domain/src/server/publicApi/platformKeys");
    const { resolveApiKey } = await import("../../../../../packages/domain/src/server/publicApi/apiKeys");
    const { key, entry } = generatePlatformKey({ name: "AlloPlace CLI", group: "alloplace", ownerEmail: "ops@alloplace.example", access: "all" });
    vi.stubEnv("PLATFORM_API_KEYS", JSON.stringify([entry]));
    try {
      // The real resolvers: PLATFORM_API_KEYS answers first, so no database lookup happens.
      const realHandler = createLobbyStackMcpHttpHandler({ resolveKey: async (value) => await resolveApiKey({ db: {} } as never, value), touchKey: async () => undefined, rateLimit, operations });
      const response = await realHandler(post({ authorization: `Bearer ${key}` }));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects a key whose scopes cover no tool", async () => {
    const response = await handler(post({ authorization: `Bearer ${keyWith(["webhooks:manage"])}` }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "insufficient_scope" } });
  });

  it("refuses browser requests from a foreign origin", async () => {
    const response = await handler(post({ authorization: "Bearer lsk_aaaaaaaa_full", origin: "https://evil.example" }));
    expect(response.status).toBe(403);
  });

  describe("DNS rebinding", () => {
    beforeEach(() => {
      vi.stubEnv("APP_BASE_URL", "https://app.example.com");
      vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://app.example.com, https://admin.example.com/");
    });
    afterEach(() => { vi.unstubAllEnvs(); });

    function rebound(origin: string | null): Request {
      // The attacker's name resolves to this server, so the URL, Host and Origin all agree with each other.
      const headers: Record<string, string> = { host: "attacker.example:3000", authorization: "Bearer lsk_aaaaaaaa_full", "content-type": "application/json", accept: "application/json, text/event-stream" };
      if (origin !== null) headers.origin = origin;
      return new Request("http://attacker.example:3000/api/mcp", { method: "POST", headers, body: JSON.stringify(initialize) });
    }

    it("rejects an Origin that matches the request's own Host but is not configured", async () => {
      const response = await handler(rebound("http://attacker.example:3000"));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    });

    it("rejects the opaque null origin", async () => {
      expect((await handler(rebound("null"))).status).toBe(403);
    });

    it("allows configured origins, whatever the Host", async () => {
      expect((await handler(rebound("https://app.example.com"))).status).toBe(200);
      expect((await handler(rebound("https://admin.example.com"))).status).toBe(200);
    });

    it("allows requests without Origin, as non-browser MCP clients send them", async () => {
      expect((await handler(rebound(null))).status).toBe(200);
    });

    it("trusts only configured app URLs", async () => {
      const { trustedMcpOrigins } = await import("./handler");
      expect([...trustedMcpOrigins({ APP_BASE_URL: "https://app.example.com/", SITE_URL: "https://www.example.com", AUTH_TRUSTED_ORIGINS: "not a url, https://x.example.com" })].sort()).toEqual(["https://app.example.com", "https://www.example.com", "https://x.example.com"]);
      expect(trustedMcpOrigins({}).size).toBe(0);
    });
  });

  it("the SDK client surfaces a 401 when the key is wrong", async () => {
    await expect(connect("lsk_00000000_wrong")).rejects.toThrow();
  });
});

describe("MCP tool listing", () => {
  it("lists every tool for a key with every scope, with annotations and output schemas", async () => {
    const client = await connect("lsk_aaaaaaaa_full");
    const { tools } = await client.listTools();
    expect(tools.map((entry) => entry.name).sort()).toEqual(mcpTools.map((entry) => entry.name).sort());
    for (const entry of tools) {
      expect(entry.description?.length).toBeGreaterThan(20);
      expect(entry.outputSchema).toMatchObject({ type: "object" });
      expect(entry.annotations?.openWorldHint).toBe(false);
    }
    const byName = Object.fromEntries(tools.map((entry) => [entry.name, entry]));
    expect(byName.list_calls!.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.cancel_appointment!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.book_appointment!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.book_appointment!.inputSchema.properties).toHaveProperty("idempotency_key");
  });

  it("lists only the tools a key's scopes allow", async () => {
    const client = await connect(keyWith(["calls:read", "messages:read"]));
    const { tools } = await client.listTools();
    expect(tools.map((entry) => entry.name).sort()).toEqual(["get_call", "list_calls", "list_messages"]);
  });

  it("does not let a key call a tool outside its scopes", async () => {
    const client = await connect(keyWith(["appointments:read"]));
    // The tool is not registered for this key, so the call fails as an unknown tool.
    await expect(client.callTool({ name: "book_appointment", arguments: { service_id: id, starts_at: at, contact_phone: "+14165550134" } })).rejects.toThrow(/book_appointment not found/);
    expect(operations.createAppointmentForApi).not.toHaveBeenCalled();
  });

  it("serves the 2026-07-28 protocol as well as 2025-era clients", async () => {
    const client = await connect(keyWith(["business:read"]), "auto");
    const { tools } = await client.listTools();
    expect(tools.map((entry) => entry.name).sort()).toEqual(["get_business", "list_services", "list_staff"]);
    const result = await client.callTool({ name: "get_business", arguments: {} });
    expect(result.structuredContent).toMatchObject({ id: businessA, booking_mode: "instant" });
  });
});

// Each tool, the arguments a model would send, and the domain call it must make.
const mappings: Array<{ tool: string; args: Record<string, unknown>; operation: keyof McpOperations; expected: unknown[] }> = [
  { tool: "get_business", args: {}, operation: "getBusinessForApi", expected: [] },
  { tool: "list_services", args: {}, operation: "listServicesForApi", expected: [] },
  { tool: "list_staff", args: {}, operation: "listStaffForApi", expected: [] },
  { tool: "update_business_hours", args: { hours: [{ day: "monday", open: "09:00", close: "17:00" }] }, operation: "updateBusinessForApi", expected: [{ hours: [{ day: "monday", open: "09:00", close: "17:00" }] }] },
  { tool: "list_calls", args: { started_after: "2026-09-26T00:00:00-04:00", started_before: "2026-09-27T00:00:00-04:00", limit: 50 }, operation: "listCallsForApi", expected: [{ limit: 50, startedAfter: new Date("2026-09-26T04:00:00.000Z"), startedBefore: new Date("2026-09-27T04:00:00.000Z") }] },
  { tool: "get_call", args: { call_id: id }, operation: "getCallForApi", expected: [id] },
  { tool: "search_contacts", args: { name: "ana" }, operation: "listContactsForApi", expected: [{ name: "ana" }] },
  { tool: "get_contact", args: { contact_id: id }, operation: "getContactForApi", expected: [id] },
  { tool: "create_contact", args: { name: "Ana", phone: "+14165550134" }, operation: "createContactForApi", expected: [{ name: "Ana", phone: "+14165550134" }] },
  { tool: "update_contact", args: { contact_id: id, email: null }, operation: "updateContactForApi", expected: [id, { email: null }] },
  { tool: "list_appointments", args: { status: "confirmed", starts_after: at }, operation: "listAppointmentsForApi", expected: [{ status: "confirmed", startsAfter: new Date(at) }] },
  { tool: "get_appointment", args: { appointment_id: id }, operation: "getAppointmentForApi", expected: [id] },
  { tool: "check_availability", args: { service_id: id, start_date: "2026-09-28", end_date: "2026-09-30" }, operation: "getAvailabilityForApi", expected: [{ serviceId: id, startDate: "2026-09-28", endDate: "2026-09-30" }] },
  { tool: "book_appointment", args: { service_id: id, starts_at: at, contact_phone: "+14165550134", sms_consent: true }, operation: "createAppointmentForApi", expected: [{ service_id: id, starts_at: at, contact_phone: "+14165550134", sms_consent: true }] },
  { tool: "cancel_appointment", args: { appointment_id: id }, operation: "cancelAppointmentForApi", expected: [id] },
  { tool: "reschedule_appointment", args: { appointment_id: id, starts_at: later }, operation: "rescheduleAppointmentForApi", expected: [id, { starts_at: later }] },
  { tool: "list_messages", args: { status: "open" }, operation: "listMessagesForApi", expected: [{ status: "open" }] },
  { tool: "add_knowledge", args: { type: "faq", question: "Do you park?", answer: "Yes, behind the building." }, operation: "createKnowledgeEntryForApi", expected: [{ type: "faq", question: "Do you park?", answer: "Yes, behind the building." }] },
];

// Optional staff and contact filters reach the domain call when the model sends them.
const optionalArguments: Array<{ tool: string; args: Record<string, unknown>; operation: keyof McpOperations; expected: unknown[] }> = [
  { tool: "check_availability", args: { service_id: id, start_date: "2026-09-28", staff_id: id }, operation: "getAvailabilityForApi", expected: [{ serviceId: id, startDate: "2026-09-28", staffId: id }] },
  { tool: "list_appointments", args: { contact_id: id }, operation: "listAppointmentsForApi", expected: [{ contactId: id }] },
  { tool: "reschedule_appointment", args: { appointment_id: id, starts_at: later, staff_id: id }, operation: "rescheduleAppointmentForApi", expected: [id, { starts_at: later, staff_id: id }] },
  { tool: "book_appointment", args: { service_id: id, starts_at: at, contact_phone: "+14165550134", staff_id: id }, operation: "createAppointmentForApi", expected: [{ service_id: id, starts_at: at, contact_phone: "+14165550134", staff_id: id }] },
];

describe("MCP tools call the v1 domain operations", () => {
  it.each(optionalArguments)("$tool passes its optional filters to $operation", async ({ tool, args, operation, expected }) => {
    const client = await connect("lsk_aaaaaaaa_full");
    const result = await client.callTool({ name: tool, arguments: args });
    expect(result.isError ?? false).toBe(false);
    const [, , ...rest] = (operations[operation] as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(rest).toEqual(expected);
  });

  it("covers every tool", () => {
    expect(mappings.map((entry) => entry.tool).sort()).toEqual(mcpTools.map((entry) => entry.name).sort());
  });

  it.each(mappings)("$tool calls $operation as the key's business with actor mcp", async ({ tool, args, operation, expected }) => {
    const client = await connect("lsk_aaaaaaaa_full");
    const result = await client.callTool({ name: tool, arguments: args });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toBeTypeOf("object");
    const mock = operations[operation] as unknown as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledTimes(1);
    const [, caller, ...rest] = mock.mock.calls[0]!;
    expect(caller).toEqual({ businessId: businessA, apiKeyId: keyIdA, actor: "mcp" });
    expect(rest).toEqual(expected);
    expect(rateLimit).toHaveBeenCalledWith(keyIdA);
    expect(logs).toContainEqual(expect.objectContaining({ event: "mcp.tool_call", tool, outcome: "ok", api_key_id: keyIdA, business_id: businessA }));
    expect(JSON.stringify(logs)).not.toContain("lsk_");
  });

  it("keeps each key inside its own business", async () => {
    const clientA = await connect("lsk_aaaaaaaa_full");
    const clientB = await connect("lsk_bbbbbbbb_full");
    await clientA.callTool({ name: "get_contact", arguments: { contact_id: id } });
    await clientB.callTool({ name: "get_contact", arguments: { contact_id: id } });
    const callers = (operations.getContactForApi as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1]);
    expect(callers).toEqual([{ businessId: businessA, apiKeyId: keyIdA, actor: "mcp" }, { businessId: businessB, apiKeyId: keyIdB, actor: "mcp" }]);
    // No tool accepts a business id, so a key cannot aim a call at another business.
    for (const entry of mcpTools) expect(Object.keys(entry.inputSchema.shape)).not.toContain("business_id");
  });
});

describe("MCP tool errors", () => {
  it("returns booking-mode conflicts with the REST error code", async () => {
    (operations.createAppointmentForApi as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new PublicApiError(409, "booking_requires_confirmation", "This business takes appointment requests that the team confirms."));
    const client = await connect("lsk_aaaaaaaa_full");
    const error = errorOf(await client.callTool({ name: "book_appointment", arguments: { service_id: id, starts_at: at, contact_phone: "+14165550134" } }));
    expect(error.code).toBe("booking_requires_confirmation");
  });

  it.each([
    ["not_found", new PublicApiError(404, "not_found", "Call not found."), "get_call", { call_id: id }, "getCallForApi"],
    ["slot_unavailable", new PublicApiError(409, "slot_unavailable", "That time is not available."), "reschedule_appointment", { appointment_id: id, starts_at: later }, "rescheduleAppointmentForApi"],
    ["conflict", new PublicApiError(409, "conflict", "A contact with this phone number already exists."), "create_contact", { phone: "+14165550134" }, "createContactForApi"],
    ["booking_disabled", new PublicApiError(409, "booking_disabled", "Booking is turned off."), "book_appointment", { service_id: id, starts_at: at, contact_phone: "+14165550134" }, "createAppointmentForApi"],
  ] as const)("maps %s", async (code, thrown, tool, args, operation) => {
    (operations[operation] as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(thrown);
    const client = await connect("lsk_aaaaaaaa_full");
    expect(errorOf(await client.callTool({ name: tool, arguments: args })).code).toBe(code);
  });

  it("hides unexpected errors behind a reference", async () => {
    (operations.getBusinessForApi as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("connection terminated: password=hunter2"));
    const client = await connect("lsk_aaaaaaaa_full");
    const error = errorOf(await client.callTool({ name: "get_business", arguments: {} }));
    expect(error.code).toBe("internal_error");
    expect(error.message).not.toContain("hunter2");
  });

  it("validates request bodies with the v1 contract before calling the domain", async () => {
    const client = await connect("lsk_aaaaaaaa_full");
    const error = errorOf(await client.callTool({ name: "create_contact", arguments: { name: "No way to reach" } }));
    expect(error.code).toBe("invalid_request");
    expect(error.message).toContain("Provide a phone or an email");
    const badPhone = errorOf(await client.callTool({ name: "book_appointment", arguments: { service_id: id, starts_at: at, contact_phone: "416-555-0134" } }));
    expect(badPhone.code).toBe("invalid_request");
    expect(operations.createContactForApi).not.toHaveBeenCalled();
    expect(operations.createAppointmentForApi).not.toHaveBeenCalled();
  });

  it("rejects arguments that do not match the tool's input schema", async () => {
    const client = await connect("lsk_aaaaaaaa_full");
    const result = await client.callTool({ name: "get_call", arguments: { call_id: "not-a-uuid" } });
    expect(result.isError).toBe(true);
    expect(operations.getCallForApi).not.toHaveBeenCalled();
  });

  it("counts tool calls against the key's rate limit and stops at the limit", async () => {
    rateLimit.mockResolvedValueOnce({ allowed: false, reason: "limited", limit: 120, remaining: 0, resetAt: 1_800_000_060, retryAfterSeconds: 17 });
    const client = await connect("lsk_aaaaaaaa_full");
    const error = errorOf(await client.callTool({ name: "list_calls", arguments: {} }));
    expect(error).toEqual({ code: "rate_limited", message: expect.stringContaining("17 seconds") });
    expect(operations.listCallsForApi).not.toHaveBeenCalled();
    rateLimit.mockResolvedValueOnce({ allowed: false, reason: "unavailable" });
    expect(errorOf(await client.callTool({ name: "list_calls", arguments: {} })).code).toBe("rate_limit_unavailable");
  });

  it("does not count listing tools against the rate limit", async () => {
    const client = await connect("lsk_aaaaaaaa_full");
    await client.listTools();
    expect(rateLimit).not.toHaveBeenCalled();
  });
});

describe("MCP idempotency", () => {
  it("replays a creating tool call that reuses an idempotency_key", async () => {
    const client = await connect("lsk_aaaaaaaa_full");
    const args = { service_id: id, starts_at: at, contact_phone: "+14165550134", idempotency_key: "booking-1" };
    const first = await client.callTool({ name: "book_appointment", arguments: args });
    const second = await client.callTool({ name: "book_appointment", arguments: args });
    expect(second.structuredContent).toEqual(first.structuredContent);
    expect(operations.createAppointmentForApi).toHaveBeenCalledTimes(1);
  });

  it("rejects an idempotency_key reused with different arguments", async () => {
    const client = await connect("lsk_aaaaaaaa_full");
    await client.callTool({ name: "create_contact", arguments: { phone: "+14165550134", idempotency_key: "contact-1" } });
    const error = errorOf(await client.callTool({ name: "create_contact", arguments: { phone: "+14165550135", idempotency_key: "contact-1" } }));
    expect(error.code).toBe("idempotency_key_reused");
    expect(operations.createContactForApi).toHaveBeenCalledTimes(1);
  });

  it("maps every creating tool to the idempotent v1 operation it stands for", () => {
    const idempotent = Object.fromEntries(mcpTools.filter((entry) => entry.idempotent).map((entry) => [entry.name, entry.operation]));
    expect(idempotent).toEqual({ create_contact: "createContact", book_appointment: "createAppointment", add_knowledge: "createKnowledgeEntry" });
    for (const entry of mcpTools) expect(entry.scope).toBe(apiOperations[entry.operation].scope);
  });
});

describe("idempotency shared between REST and MCP", () => {
  const restKey = { businessId: businessA, apiKeyId: keyIdA, scopes: [...apiKeyScopes] };
  const booking = { service_id: id, starts_at: at, contact_phone: "+14165550134" };

  function restBook(body: Record<string, unknown>, key: string) {
    return v1.createAppointment(new Request("https://app.example.com/api/v1/appointments", {
      method: "POST",
      headers: { authorization: "Bearer lsk_aaaaaaaa_full", "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(body, null, 2),
    }));
  }

  beforeEach(() => {
    for (const mock of Object.values(rest)) mock.mockReset();
    rest.resolveApiKey.mockResolvedValue(restKey);
    rest.createAppointmentForApi.mockResolvedValue({ ...appointment, id: "11111111-2222-4333-8444-555555555555" });
  });

  it("replays a REST booking when MCP retries it with the same key", async () => {
    const response = await restBook(booking, "shared-1");
    expect(response.status).toBe(201);
    const first = (await response.json()) as { data: { id: string } };
    const client = await connect("lsk_aaaaaaaa_full");
    // Same fields, different key order: the hash covers the JSON value, not its text.
    const result = await client.callTool({ name: "book_appointment", arguments: { contact_phone: booking.contact_phone, starts_at: at, service_id: id, idempotency_key: "shared-1" } });
    expect(result.structuredContent).toEqual(first.data);
    expect(rest.createAppointmentForApi).toHaveBeenCalledTimes(1);
    expect(operations.createAppointmentForApi).not.toHaveBeenCalled();
  });

  it("replays an MCP booking when REST retries it with the same key", async () => {
    const client = await connect("lsk_aaaaaaaa_full");
    const result = await client.callTool({ name: "book_appointment", arguments: { ...booking, idempotency_key: "shared-2" } });
    const response = await restBook(booking, "shared-2");
    expect(response.status).toBe(201);
    expect(response.headers.get("idempotent-replayed")).toBe("true");
    expect(((await response.json()) as { data: unknown }).data).toEqual(result.structuredContent);
    expect(operations.createAppointmentForApi).toHaveBeenCalledTimes(1);
    expect(rest.createAppointmentForApi).not.toHaveBeenCalled();
  });

  it("rejects the same key with a different body across transports", async () => {
    await restBook(booking, "shared-3");
    const client = await connect("lsk_aaaaaaaa_full");
    expect(errorOf(await client.callTool({ name: "book_appointment", arguments: { ...booking, contact_phone: "+14165550135", idempotency_key: "shared-3" } })).code).toBe("idempotency_key_reused");
    await client.callTool({ name: "create_contact", arguments: { phone: "+14165550136", idempotency_key: "shared-4" } });
    const response = await v1.createContact(new Request("https://app.example.com/api/v1/contacts", { method: "POST", headers: { authorization: "Bearer lsk_aaaaaaaa_full", "content-type": "application/json", "idempotency-key": "shared-4" }, body: JSON.stringify({ phone: "+14165550137" }) }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "idempotency_key_reused" } });
  });

  it("keeps different operations and different keys apart", async () => {
    await restBook(booking, "shared-5");
    const client = await connect("lsk_aaaaaaaa_full");
    // The same idempotency key on another operation is a new request.
    const contact = await client.callTool({ name: "create_contact", arguments: { phone: "+14165550138", idempotency_key: "shared-5" } });
    expect(contact.isError ?? false).toBe(false);
    // Another API key with the same idempotency key is a new request too.
    const other = await connect("lsk_bbbbbbbb_full");
    const booked = await other.callTool({ name: "book_appointment", arguments: { ...booking, idempotency_key: "shared-5" } });
    expect(booked.isError ?? false).toBe(false);
    expect(operations.createAppointmentForApi).toHaveBeenCalledTimes(1);
  });
});

describe("MCP with OAuth access tokens", () => {
  it("challenges unauthenticated requests with the protected resource metadata", async () => {
    const response = await handler(post({}));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"');
  });

  it("rejects unknown, revoked or expired tokens with invalid_token", async () => {
    const response = await handler(post({ authorization: "Bearer lsa_unknowntoken" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("rejects a token issued for another resource", async () => {
    const response = await handler(post({ authorization: `Bearer ${grantToken(["calls:read"], { resources: ["https://elsewhere.example.com/mcp"] })}` }));
    expect(response.status).toBe(401);
  });

  it("rejects a grant with no tool scope", async () => {
    const response = await handler(post({ authorization: `Bearer ${grantToken([])}` }));
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
  });

  it("lists only the tools the grant allows and runs them as the grant's business, audited as the grant", async () => {
    const client = await connect(grantToken(["calls:read", "appointments:write"]));
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(["book_appointment", "cancel_appointment", "get_call", "list_calls", "reschedule_appointment"]);
    await client.callTool({ name: "list_calls", arguments: {} });
    const [, caller] = (operations.listCallsForApi as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(caller).toEqual({ businessId: businessA, grantId: grantIdA, userId: grantUser, actor: "mcp" });
    expect(rateLimit).toHaveBeenCalledWith(`grant:${grantIdA}`);
    expect(logs).toContainEqual(expect.objectContaining({ event: "mcp.tool_call", tool: "list_calls", oauth_grant_id: grantIdA, business_id: businessA }));
    expect(JSON.stringify(logs)).not.toContain("lsa_");
    expect(touchedGrants).toContain(grantIdA);
  });

  it("keeps grants for different businesses apart", async () => {
    const clientA = await connect(grantToken(["contacts:read"]));
    const clientB = await connect(grantToken(["contacts:read"], { businessId: businessB, grantId: "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e" }));
    await clientA.callTool({ name: "get_contact", arguments: { contact_id: id } });
    await clientB.callTool({ name: "get_contact", arguments: { contact_id: id } });
    const callers = (operations.getContactForApi as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => (call[1] as { businessId: string }).businessId);
    expect(callers).toEqual([businessA, businessB]);
  });

  it("scopes idempotency keys to the grant, apart from API keys", async () => {
    const client = await connect(grantToken(["appointments:write"]));
    await client.callTool({ name: "book_appointment", arguments: { service_id: id, starts_at: at, contact_phone: "+14165550134", idempotency_key: "grant-1" } });
    expect([...idempotency.store.keys()]).toContain(`grant:${grantIdA}:createAppointment:grant-1`);
  });

  it("stops a grant at its rate limit", async () => {
    rateLimit.mockResolvedValueOnce({ allowed: false, reason: "limited", limit: 120, remaining: 0, resetAt: 0, retryAfterSeconds: 9 });
    const client = await connect(grantToken(["calls:read"]));
    expect(errorOf(await client.callTool({ name: "list_calls", arguments: {} })).code).toBe("rate_limited");
    expect(operations.listCallsForApi).not.toHaveBeenCalled();
  });

  it("never sends an lsa_ token to the API key resolver", async () => {
    const resolveKey = vi.fn(async () => null);
    const oauthOnly = createLobbyStackMcpHttpHandler({ resolveKey, resolveGrant: async () => null, resolvePartnerGrant: async () => null, rateLimit, operations });
    await oauthOnly(post({ authorization: "Bearer lsa_abc" }));
    expect(resolveKey).not.toHaveBeenCalled();
  });
});

describe("MCP for partner connections", () => {
  const everyScope = [...apiKeyScopes];

  it("accepts a partner's platform key and lists the partner tools with the per-business ones, each taking business_id", async () => {
    const client = await connect(partnerKeyWith(everyScope));
    const { tools } = await client.listTools();
    const names = tools.map((entry) => entry.name);
    expect(names).toEqual(expect.arrayContaining([...partnerMcpTools.map((entry) => entry.name), ...mcpTools.map((entry) => entry.name)]));
    expect(names.some((name) => name.includes("platform_key") || name.includes("api_key"))).toBe(false);
    const byName = Object.fromEntries(tools.map((entry) => [entry.name, entry]));
    for (const entry of mcpTools) {
      expect(byName[entry.name]!.inputSchema.properties).toHaveProperty("business_id");
      expect(byName[entry.name]!.inputSchema.required).toContain("business_id");
    }
    expect(client.getInstructions()).toContain("business_id");
    expect(client.getInstructions()).toContain("destructive");
  });

  it("marks the tools that delete, release, revoke or remove as destructive, and the reads as read-only", async () => {
    const client = await connect(partnerKeyWith(everyScope));
    const byName = Object.fromEntries((await client.listTools()).tools.map((entry) => [entry.name, entry]));
    for (const name of ["delete_business", "release_business", "revoke_demo", "delete_demo", "rotate_demo_link", "archive_package", "remove_domain", "delete_template", "remove_team_member", "revoke_team_invitation"]) {
      expect(byName[name]!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
    for (const entry of partnerMcpTools.filter((tool) => /^(get|list)_/.test(tool.name))) expect(byName[entry.name]!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(byName.create_demo!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("lists only the partner tools a key's scopes allow, and the billing reads with partner.billing:write", async () => {
    const client = await connect(partnerKeyWith(["partner:read"]));
    const names = (await client.listTools()).tools.map((entry) => entry.name);
    expect(names).toContain("get_partner");
    expect(names).not.toContain("create_demo");
    expect(names).not.toContain("get_business");
    const billing = await connect(partnerKeyWith(["partner.billing:write"]));
    expect((await billing.listTools()).tools.map((entry) => entry.name)).toEqual(expect.arrayContaining(["get_billing", "set_pool_overage", "get_stripe_status"]));
  });

  it("runs a partner tool as the key, counting against the key's rate limit", async () => {
    const client = await connect(partnerKeyWith(["partner:read"]));
    const result = await client.callTool({ name: "get_partner", arguments: {} });
    expect(result.structuredContent).toEqual(partnerView);
    const [, subject] = (partnerOperations.getPartnerForApi as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(subject).toMatchObject({ platformKeyId, partnerId });
    expect(rateLimit).toHaveBeenCalledWith(`platform:${platformKeyId}`);
    expect(logs).toContainEqual(expect.objectContaining({ tool: "get_partner", outcome: "ok", platform_key_id: platformKeyId, partner_id: partnerId }));
    expect(JSON.stringify(logs)).not.toContain("lsp_");
  });

  it("runs a per-business tool on the business_id the partner reaches, and nowhere else", async () => {
    const client = await connect(partnerKeyWith(["contacts:read"]));
    const result = await client.callTool({ name: "get_contact", arguments: { business_id: businessA, contact_id: id } });
    expect(result.isError ?? false).toBe(false);
    expect(partnerBusinessCaller).toHaveBeenCalledWith(expect.objectContaining({ kind: "partner" }), businessA);
    const [, caller, contactId] = (operations.getContactForApi as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(caller).toEqual({ businessId: businessA, platformKeyId, groupId: partnerId, partnerId, actor: "platform_key" });
    expect(contactId).toBe(id);
    // Another partner's business, or one that doesn't exist, is not found.
    expect(errorOf(await client.callTool({ name: "get_contact", arguments: { business_id: businessB, contact_id: id } })).code).toBe("not_found");
    expect(operations.getContactForApi).toHaveBeenCalledTimes(1);
    // Without a business_id the call fails before reaching anything.
    const missing = await client.callTool({ name: "get_contact", arguments: { contact_id: id } });
    expect(missing.isError).toBe(true);
    expect(partnerBusinessCaller).toHaveBeenCalledTimes(2);
  });

  it("scopes a partner's idempotency keys to the business, as REST does for a platform key", async () => {
    const client = await connect(partnerKeyWith(["contacts:write"]));
    await client.callTool({ name: "create_contact", arguments: { business_id: businessA, name: "Ana", phone: "+14165550134", idempotency_key: "k-1" } });
    expect([...idempotency.store.keys()]).toContain(`platform:${platformKeyId}:${businessA}:createContact:k-1`);
  });

  it("accepts an agency grant, acting as the person with their grant on every partner and business tool", async () => {
    const client = await connect(agencyToken(["partner:read", "partner.businesses:write", "calls:read"], "admin"));
    const names = (await client.listTools()).tools.map((entry) => entry.name);
    expect(names).toEqual(expect.arrayContaining(["get_partner", "list_businesses", "delete_business", "list_calls", "get_call"]));
    expect(names).not.toContain("create_demo");
    await client.callTool({ name: "get_partner", arguments: {} });
    const [, subject] = (partnerOperations.getPartnerForApi as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(subject).toEqual({ kind: "member", partnerId, userId: agencyUser, grantId: agencyGrantId, scopes: ["partner:read", "partner.businesses:write", "calls:read"] });
    expect(rateLimit).toHaveBeenCalledWith(`grant:${agencyGrantId}`);
    await client.callTool({ name: "list_calls", arguments: { business_id: businessA } });
    const [, caller] = (operations.listCallsForApi as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(caller).toEqual({ businessId: businessA, partnerId, userId: agencyUser, actor: "partner_member", mcpGrantId: agencyGrantId });
    expect(touchedGrants).toContain(agencyGrantId);
  });

  it("creates a business from a template and package, counting against the person's limit", async () => {
    const limit = vi.fn(async () => undefined);
    handler = createLobbyStackMcpHttpHandler({ resolveKey: async () => null, resolveGrant: async () => null, resolvePartnerGrant: async (token) => partnerGrants[token] ?? null, touchGrant: async () => undefined, rateLimit, operations, partnerOperations, partnerBusinessCaller, partnerLimit: limit, partnerContext: () => ({ db: {} }) as never, storage: () => ({}) as never, log: () => undefined });
    const client = await connect(agencyToken(["businesses:create", "partner:read", "partner.businesses:write"]));
    const templateId = randomUUID();
    const packageId = randomUUID();
    const result = await client.callTool({ name: "create_business", arguments: { name: "Joe's Plumbing", owner_email: "joe@joesplumbing.test", timezone: "America/Chicago", template_id: templateId, package_id: packageId, idempotency_key: "joe" } });
    expect(result.structuredContent).toMatchObject({ id: businessA });
    const [, input, options] = (partnerOperations.createPartnerBusinessForApi as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(input).toMatchObject({ key: { kind: "member", userId: agencyUser }, idempotencyKey: "joe", body: { name: "Joe's Plumbing", owner_email: "joe@joesplumbing.test", timezone: "America/Chicago", template_id: templateId, package_id: packageId } });
    expect(options.setup).toBeDefined();
    await options.beforeCreate();
    expect(limit).toHaveBeenCalledWith({ partnerId, userId: agencyUser }, expect.objectContaining({ name: "partner-business-create", limit: 30 }));
  });

  it("refuses a connection whose scopes cover no tool, and tells a business connection nothing about partners", async () => {
    const response = await handler(post({ authorization: `Bearer ${partnerKeyWith(["webhooks:manage"])}` }));
    expect(response.status).toBe(403);
    const client = await connect("lsk_aaaaaaaa_full");
    const names = (await client.listTools()).tools.map((entry) => entry.name);
    expect(names).not.toContain("get_partner");
    expect(client.getInstructions()).not.toContain("agency");
  });
});
