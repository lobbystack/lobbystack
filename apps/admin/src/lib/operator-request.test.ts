import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const fixture = vi.hoisted(() => ({
  session: null as unknown,
  activeBusinessId: null as string | null,
  memberships: [] as Array<{ role: string }>,
  transactions: [] as unknown[],
  report: vi.fn(),
}));
vi.mock("./auth", () => ({ getSession: async () => fixture.session }));
vi.mock("./error-reporting", () => ({ reportServerError: fixture.report }));
vi.mock("./domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));
vi.mock("@lobbystack/db", async (original) => {
  const db = await original<typeof import("@lobbystack/db")>();
  // Each transaction here runs one query: the user's active business, or their membership.
  const tx = { select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === db.users ? [{ activeBusinessId: fixture.activeBusinessId }] : fixture.memberships }) }) }) };
  return { ...db, withBusinessTransaction: async (_db: unknown, context: unknown, callback: (tx: unknown) => unknown) => { fixture.transactions.push(context); return await callback(tx); } };
});

import { operatorRoute, signedInRoute, type OperatorRequest, type SignedInRequest } from "./operator-request";

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
  fixture.memberships = [{ role: "viewer" }];
  fixture.transactions = [];
});

describe("operatorRoute", () => {
  it("hands the handler the session, the business the query names, the body and the domain context", async () => {
    const response = await post({ note: "hi" }, `?businessId=${businessId}`);
    expect(response.status).toBe(200);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", businessId, body: { note: "hi" }, domain: { db: "app" } }));
    expect(fixture.transactions).toEqual([]);
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
    expect(fixture.transactions).toEqual([{ userId: "user-1", businessId, actorType: "operator" }]);
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
});
