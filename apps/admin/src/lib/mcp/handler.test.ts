import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("../error-reporting", () => ({ reportServerError: vi.fn(async () => undefined) }));

const idempotency = vi.hoisted(() => ({ store: new Map<string, { hash: string; body?: string }>() }));
vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  // An in-memory idempotency store with the same replay rules as the PostgreSQL one.
  return {
    ...actual,
    beginIdempotentRequest: vi.fn(async (_context: unknown, scope: { apiKeyId: string; operation: string; key: string }, hash: string) => {
      const id = `${scope.apiKeyId}:${scope.operation}:${scope.key}`;
      const existing = idempotency.store.get(id);
      if (!existing) {
        idempotency.store.set(id, { hash });
        return { kind: "new" };
      }
      if (existing.hash !== hash) throw new actual.PublicApiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request body.");
      return { kind: "replay", response: { status: 200, body: existing.body } };
    }),
    completeIdempotentRequest: vi.fn(async (_context: unknown, scope: { apiKeyId: string; operation: string; key: string }, hash: string, response: { body: string }) => {
      idempotency.store.set(`${scope.apiKeyId}:${scope.operation}:${scope.key}`, { hash, body: response.body });
    }),
    releaseIdempotentRequest: vi.fn(async (_context: unknown, scope: { apiKeyId: string; operation: string; key: string }) => {
      idempotency.store.delete(`${scope.apiKeyId}:${scope.operation}:${scope.key}`);
    }),
  };
});

import { PublicApiError, type ResolvedApiKey } from "@lobbystack/domain";
import { apiKeyScopes, type ApiKeyScope } from "@lobbystack/shared";

import type { RateLimitDecision } from "../public-api/rate-limit";
import { createLobbyStackMcpHttpHandler } from "./handler";
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

function keyWith(scopes: ApiKeyScope[]): string {
  const secret = `lsk_cccccccc_${scopes.join("_")}`;
  secrets[secret] = { businessId: businessA, apiKeyId: keyIdA, scopes };
  return secret;
}

const business = { id: businessA, name: "Maple Dental", timezone: "America/Toronto", locale: "en", website_url: null, booking_mode: "instant", hours: [{ day: "monday", open: "09:00", close: "17:00" }], created_at: at, updated_at: at };
const service = { id, name: "Cleaning", description: null, duration_minutes: 30, created_at: at, updated_at: at };
const call = { id, channel: "phone", status: "completed", outcome: "message_taken", summary: "Wants a callback.", end_reason: "completed", contact_id: id, caller_name: "Ana", caller_phone: "+14165550134", duration_seconds: 42, recording_available: false, started_at: at, ended_at: later, created_at: at };
const contact = { id, name: "Ana", phone: "+14165550134", email: null, locale: "en", timezone: null, created_at: at, updated_at: at };
const appointment = { id, status: "confirmed", starts_at: at, ends_at: later, timezone: "America/Toronto", service_id: id, service_name: "Cleaning", staff_id: id, staff_name: "Sam", contact_id: id, contact_name: "Ana", contact_phone: "+14165550134", source: "api", calendar_sync_status: "pending", created_at: at, updated_at: at };
const message = { id, status: "open", title: "Callback", body: "Please call back.", caller_name: "Ana", callback_phone: "+14165550134", urgency: "normal", callback_window: null, channel: "voice", call_id: id, created_at: at, updated_at: at };
const knowledge = { id, type: "faq", title: "Do you park?", content: "Yes, behind the building.", created_at: at };
const page = <T>(data: T[]) => ({ data, next_cursor: null, has_more: false });

function fakeOperations(): McpOperations {
  return {
    getBusinessForApi: vi.fn(async () => business),
    updateBusinessForApi: vi.fn(async () => business),
    listServicesForApi: vi.fn(async () => [service]),
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

const allow = async (): Promise<RateLimitDecision> => ({ allowed: true, limit: 120, remaining: 119, resetAt: 1_800_000_060 });

let operations: McpOperations;
let rateLimit: ReturnType<typeof vi.fn<(apiKeyId: string) => Promise<RateLimitDecision>>>;
let logs: Array<Record<string, unknown>>;
let handler: (request: Request) => Promise<Response>;
const clients: Client[] = [];

beforeEach(() => {
  idempotency.store.clear();
  operations = fakeOperations();
  rateLimit = vi.fn(allow);
  logs = [];
  handler = createLobbyStackMcpHttpHandler({
    resolveKey: async (secret) => secrets[secret] ?? null,
    touchKey: async () => undefined,
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

  it("rejects a key whose scopes cover no tool", async () => {
    const response = await handler(post({ authorization: `Bearer ${keyWith(["webhooks:manage"])}` }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "insufficient_scope" } });
  });

  it("refuses browser requests from a foreign origin", async () => {
    const response = await handler(post({ authorization: "Bearer lsk_aaaaaaaa_full", origin: "https://evil.example" }));
    expect(response.status).toBe(403);
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
    expect(tools.map((entry) => entry.name).sort()).toEqual(["get_business", "list_services"]);
    const result = await client.callTool({ name: "get_business", arguments: {} });
    expect(result.structuredContent).toMatchObject({ id: businessA, booking_mode: "instant" });
  });
});

// Each tool, the arguments a model would send, and the domain call it must make.
const mappings: Array<{ tool: string; args: Record<string, unknown>; operation: keyof McpOperations; expected: unknown[] }> = [
  { tool: "get_business", args: {}, operation: "getBusinessForApi", expected: [] },
  { tool: "list_services", args: {}, operation: "listServicesForApi", expected: [] },
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

describe("MCP tools call the v1 domain operations", () => {
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
});
