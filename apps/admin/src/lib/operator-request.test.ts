import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const fixture = vi.hoisted(() => ({
  session: null as unknown,
  activeBusinessId: null as string | null,
  /** The businesses the person is on the team of, as the database lists them. Unset, just the active business. */
  ownBusinessIds: null as string[] | null,
  /** The active business on the partner's domains. */
  partnerActiveBusinessId: null as string | null,
  memberships: [] as Array<{ role: string; partnerId: string | null; accessLevel: "full" | "activity" }>,
  /** The business as a partner member who isn't on its team reads it, with their role on the partner while their open lasts. */
  opened: [] as Array<{ partnerId: string | null; accessLevel: "full" | "activity"; partnerRole: string | null }>,
  transactions: [] as unknown[],
  report: vi.fn(),
}));
vi.mock("./auth", () => ({ getSession: async () => fixture.session }));
vi.mock("./error-reporting", () => ({ reportServerError: fixture.report }));
vi.mock("./domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));
vi.mock("@lobbystack/db", async (original) => {
  const db = await original<typeof import("@lobbystack/db")>();
  // Each transaction here reads the user's active business on a brand, or their membership and the business's partner and access level, and without
  // a membership the business with the person's partner open of it.
  const rows = async (table: unknown) => table === db.users ? [{ activeBusinessId: fixture.activeBusinessId }] : table === db.userActiveBusinesses ? (fixture.partnerActiveBusinessId ? [{ businessId: fixture.partnerActiveBusinessId }] : []) : table === db.businesses ? fixture.opened : fixture.memberships;
  const own = () => (fixture.ownBusinessIds ?? (fixture.activeBusinessId ? [fixture.activeBusinessId] : [])).map((business_id) => ({ business_id, role: "business_owner", partner_id: null, access_via: "membership" }));
  const tx = { execute: async () => ({ rows: own() }), select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: () => rows(table) }), innerJoin: () => ({ where: () => ({ limit: () => rows(table) }) }) }) }) };
  return { ...db, withBusinessTransaction: async (_db: unknown, context: unknown, callback: (tx: unknown) => unknown) => { fixture.transactions.push(context); return await callback(tx); } };
});

import { operatorRoute, signedInRoute, type OperatorRequest, type SignedInRequest } from "./operator-request";
import { setBrandHeaders } from "./request-brand";

const businessId = "7d1f5a52-2f0e-4a4c-9a55-0c8a4c1b2f10";
const otherBusinessId = "0b6f8c1e-3a2d-4e5f-8a9b-1c2d3e4f5a6b";
const seen = vi.fn<(input: OperatorRequest | SignedInRequest) => void>();
const echo = operatorRoute(async (operator) => { seen(operator); return NextResponse.json({ businessId: operator.businessId }); });
const call = (route: typeof echo, query = "", init: RequestInit = {}) => route(new Request(`https://app.example.test/api/thing${query}`, init));
const post = (body: unknown, query = "") => call(echo, query, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  fixture.session = { user: { id: "user-1" }, session: { id: "session-1", userId: "user-1", expiresAt: new Date(0) } };
  fixture.activeBusinessId = null;
  fixture.ownBusinessIds = null;
  fixture.partnerActiveBusinessId = null;
  fixture.memberships = [{ role: "viewer", partnerId: null, accessLevel: "full" }];
  fixture.opened = [];
  fixture.transactions = [];
});

describe("operatorRoute", () => {
  it("hands the handler the session, the business the query names, the body and the domain context", async () => {
    const response = await post({ note: "hi" }, `?businessId=${businessId}`);
    expect(response.status).toBe(200);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", businessId, body: { note: "hi" }, domain: { db: "app" }, access: expect.objectContaining({ businessId, role: "viewer", partnerId: null }) }));
    // The person's access to the business is checked once before the handler runs.
    expect(fixture.transactions).toEqual([{ userId: "user-1", businessId, actorType: "operator" }]);
  });

  it("answers 403 before the handler runs to a user who isn't a member", async () => {
    fixture.memberships = [];
    const response = await post({}, `?businessId=${businessId}`);
    expect(response.status).toBe(403);
    expect(seen).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    fixture.session = null;
    expect((await call(echo, `?businessId=${businessId}`)).status).toBe(401);
    expect(seen).not.toHaveBeenCalled();
  });

  it.each([
    ["the query", () => call(echo, "?businessId=abc")],
    ["the header", () => call(echo, "", { headers: { "x-business-id": "abc" } })],
    ["the body", () => post({ businessId: 42 })],
  ])("answers a businessId in %s that isn't a UUID with 400 instead of the active business", async (_where, send) => {
    fixture.activeBusinessId = businessId;
    const response = await send();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "businessId must be a UUID.", code: "invalid_request" });
    expect(seen).not.toHaveBeenCalled();
    expect(fixture.transactions).toEqual([]);
  });

  it("answers a body that names another business than the URL with 400", async () => {
    const response = await post({ businessId: otherBusinessId }, `?businessId=${businessId}`);
    expect(response.status).toBe(400);
    expect(seen).not.toHaveBeenCalled();
  });

  it("accepts the same business named twice", async () => {
    expect((await post({ businessId: businessId.toUpperCase() }, `?businessId=${businessId}`)).status).toBe(200);
  });

  it("acts on the user's active business when the request names none", async () => {
    fixture.activeBusinessId = businessId;
    await expect((await call(echo)).json()).resolves.toEqual({ businessId });
  });

  it("acts on one of the user's own businesses when the remembered one is gone", async () => {
    fixture.activeBusinessId = otherBusinessId;
    fixture.ownBusinessIds = [businessId];
    await expect((await call(echo)).json()).resolves.toEqual({ businessId });
  });

  it("answers 400 when the request names no business and none is active", async () => {
    const response = await call(echo);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "business_required" });
  });

  it.each([["not JSON", "{"], ["a list", "[]"], ["null", "null"]])("answers a body that is %s with 400", async (_kind, body) => {
    expect((await post(body, `?businessId=${businessId}`)).status).toBe(400);
    expect(seen).not.toHaveBeenCalled();
  });

  it("reads an empty body as {}", async () => {
    await call(echo, `?businessId=${businessId}`, { method: "POST" });
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ body: {} }));
  });

  it("passes route params through", async () => {
    const route = operatorRoute<{ callId: string }>(async (_operator, { callId }) => NextResponse.json({ callId }));
    const response = await route(new Request(`https://app.example.test/api/calls/c1?businessId=${businessId}`), { params: Promise.resolve({ callId: "c1" }) });
    await expect(response.json()).resolves.toEqual({ callId: "c1" });
  });
});

describe("operatorRoute transactions", () => {
  const read = (minimumRole?: "business_admin") => operatorRoute(async ({ transaction }) => NextResponse.json(await transaction(async (_tx, role) => ({ role }), minimumRole ? { minimumRole } : {})));

  it("runs in the business's transaction with the member's role", async () => {
    const response = await call(read(), `?businessId=${businessId}`);
    await expect(response.json()).resolves.toEqual({ role: "viewer" });
    expect(fixture.transactions).toEqual([{ userId: "user-1", businessId, actorType: "operator" }, { userId: "user-1", businessId, actorType: "operator" }]);
  });

  it("answers 403 to a user who isn't a member", async () => {
    fixture.memberships = [];
    const response = await call(read(), `?businessId=${otherBusinessId}`);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "forbidden" });
  });

  it("answers 403 to a member below the minimum role", async () => {
    expect((await call(read("business_admin"), `?businessId=${businessId}`)).status).toBe(403);
  });
});

describe("operator routes on each brand's domain", () => {
  const partnerId = "5a0f6c7e-1d2b-4c3a-9e8f-7a6b5c4d3e2f";
  const otherPartnerId = "6b1a7d8f-2e3c-4d4b-8f9a-8b7c6d5e4f3a";
  const echoAt = (path: string, headers: Headers, query = `?businessId=${businessId}`) => echo(new Request(`https://app.example.test${path}${query}`, { headers }));
  const host = () => setBrandHeaders(new Headers(), { kind: "host" });
  const partnerHost = (id = partnerId) => setBrandHeaders(new Headers(), { kind: "partner", partnerId: id, origin: "https://acme.portal.example.test" });
  const partnerBusiness = (accessLevel: "full" | "activity", role = "business_owner") => { fixture.memberships = [{ role, partnerId, accessLevel }]; };

  it("opens a direct business only on the host's domain, and a partner's business only on that partner's", async () => {
    expect((await echoAt("/api/calls", host())).status).toBe(200);
    expect((await echoAt("/api/calls", partnerHost())).status).toBe(403);
    partnerBusiness("full");
    expect((await echoAt("/api/calls", partnerHost())).status).toBe(200);
    expect((await echoAt("/api/calls", host())).status).toBe(403);
    expect((await echoAt("/api/calls", partnerHost(otherPartnerId))).status).toBe(403);
    // A request the proxy resolved to no brand gets the host's.
    expect((await echoAt("/api/calls", new Headers())).status).toBe(403);
    // Only the two requests on the business's own brand reached the handler.
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("acts on the active business of the request's brand when the request names none", async () => {
    partnerBusiness("full");
    fixture.activeBusinessId = otherBusinessId;
    fixture.partnerActiveBusinessId = businessId;
    await expect((await echoAt("/api/calls", partnerHost(), "")).json()).resolves.toEqual({ businessId });
    fixture.partnerActiveBusinessId = null;
    expect((await echoAt("/api/calls", partnerHost(), "")).status).toBe(400);
  });

  it("enforces an activity-only business on the server: activity routes answer, setup, team, billing, API keys and MCP don't", async () => {
    partnerBusiness("activity");
    for (const path of ["/api/calls", "/api/messages", "/api/appointments", "/api/contacts/c1", "/api/dashboard", "/api/realtime", "/api/onboarding/phone-verification"]) {
      expect((await echoAt(path, partnerHost())).status, path).toBe(200);
    }
    for (const path of ["/api/knowledge", "/api/agent", "/api/hours", "/api/team", "/api/billing", "/api/api-keys", "/api/oauth-grants", "/api/webhook-endpoints", "/api/unlisted"]) {
      const response = await echoAt(path, partnerHost());
      expect(response.status, path).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: "forbidden" });
    }
  });

  it("gives a full-access business today's owner and admin routes except billing, API keys and MCP", async () => {
    partnerBusiness("full");
    for (const path of ["/api/calls", "/api/knowledge", "/api/agent", "/api/team", "/api/phone-numbers"]) {
      expect((await echoAt(path, partnerHost())).status, path).toBe(200);
    }
    for (const path of ["/api/billing", "/api/billing/checkout", "/api/api-keys", "/api/oauth-grants", "/api/webhook-endpoints"]) {
      expect((await echoAt(path, partnerHost())).status, path).toBe(403);
    }
  });

  it("reads the capability from the route a percent-encoded path reaches, and refuses a path that doesn't decode", async () => {
    partnerBusiness("full");
    for (const path of ["/api/%62illing", "/api/%77ebhook-endpoints", "/api/api%2Dkeys", "/api/%6Fauth-grants/x"]) {
      expect((await echoAt(path, partnerHost())).status, path).toBe(403);
    }
    expect((await echoAt("/api/%6Bnowledge", partnerHost())).status).toBe(200);
    const malformed = await echoAt("/api/%E0%A4%A", partnerHost());
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ code: "invalid_path" });
    expect(seen).toHaveBeenCalledOnce();
  });

  it("lets a partner member who opened the business in on the partner's domain with full access whatever its level, and nowhere else", async () => {
    fixture.memberships = [];
    fixture.opened = [{ partnerId, accessLevel: "activity", partnerRole: "member" }];
    for (const path of ["/api/calls", "/api/knowledge", "/api/agent", "/api/team"]) {
      expect((await echoAt(path, partnerHost())).status, path).toBe(200);
    }
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ access: expect.objectContaining({ via: "partner", role: "business_admin", partnerRole: "member", partnerId, accessLevel: "activity" }) }));
    for (const path of ["/api/billing", "/api/api-keys", "/api/oauth-grants", "/api/webhook-endpoints"]) {
      expect((await echoAt(path, partnerHost())).status, path).toBe(403);
    }
    expect((await echoAt("/api/calls", host())).status).toBe(403);
    expect((await echoAt("/api/calls", partnerHost(otherPartnerId))).status).toBe(403);
    // Without an open, or once it runs out, the database answers no partner role.
    fixture.opened = [{ partnerId, accessLevel: "full", partnerRole: null }];
    expect((await echoAt("/api/calls", partnerHost())).status).toBe(403);
  });

  it("checks the route's capability again in each transaction", async () => {
    partnerBusiness("full", "business_admin");
    const read = operatorRoute(async ({ transaction }) => NextResponse.json(await transaction(async (_tx, role) => ({ role }), { minimumRole: "business_admin" })));
    const response = await read(new Request(`https://app.example.test/api/knowledge?businessId=${businessId}`, { headers: partnerHost() }));
    await expect(response.json()).resolves.toEqual({ role: "business_admin" });
    expect(fixture.transactions).toHaveLength(2);
  });
});

describe("operator route errors", () => {
  const failing = (error: unknown) => operatorRoute(async () => { throw error; });
  const run = (error: unknown) => call(failing(error), `?businessId=${businessId}`);

  it("keeps the status, message and code of an error that has a status", async () => {
    const response = await run(Object.assign(new Error("This number offer expired."), { status: 409, code: "number_offer_expired" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "This number offer expired.", code: "number_offer_expired" });
    expect(fixture.report).not.toHaveBeenCalled();
  });

  it("answers a failed schema check with 400", async () => {
    const parsed = z.object({ title: z.string() }).safeParse({});
    const response = await run(parsed.error);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("title"), code: "invalid_request" });
    expect(fixture.report).not.toHaveBeenCalled();
  });

  it("answers any other error with a reported 500 that hides its message", async () => {
    const response = await run(new Error("connection refused"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Request failed.", errorId: expect.any(String) });
    await vi.waitFor(() => expect(fixture.report).toHaveBeenCalledWith(expect.objectContaining({ message: "connection refused" }), expect.objectContaining({ operation: "api_response" })));
  });
});

describe("signedInRoute", () => {
  const user = signedInRoute(async (input) => { seen(input); return NextResponse.json({ ok: true }); });

  it("leaves the business unset when the request names none", async () => {
    fixture.activeBusinessId = businessId;
    await call(user);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", businessId: undefined }));
    expect(fixture.transactions).toEqual([]);
  });

  it("still answers a malformed businessId with 400", async () => {
    expect((await call(user, "", { method: "POST", body: JSON.stringify({ businessId: "abc" }) })).status).toBe(400);
  });

  it("reads no more of the body than the route allows, whatever the request claims its length is", async () => {
    const capped = signedInRoute(async (input) => { seen(input); return NextResponse.json({ ok: true }); }, { maxBodyBytes: 32 });
    expect((await call(capped, "", { method: "POST", body: JSON.stringify({ name: "short" }) })).status).toBe(200);
    const claimed = await call(capped, "", { method: "POST", body: JSON.stringify({ name: "x" }), headers: { "content-length": "4096" } });
    expect(claimed.status).toBe(413);
    // A streamed body carries no length, so the read stops at the limit instead.
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ name: "x".repeat(64) }))); controller.close(); } });
    const streamed = await call(capped, "", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(streamed.status).toBe(413);
    expect(await streamed.json()).toMatchObject({ code: "body_too_large" });
    expect(seen).toHaveBeenCalledOnce();
  });
});
