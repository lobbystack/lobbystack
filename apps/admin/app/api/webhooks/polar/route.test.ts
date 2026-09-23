import { createHmac } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), insert: vi.fn(), enqueue: vi.fn(), scope: vi.fn(), where: vi.fn() }));
vi.mock("@lobbystack/providers", () => import("../../../../../../packages/providers/src/polar/webhook"));
vi.mock("@/lib/api-helpers", () => ({ getDispatcherDatabase: () => ({ db: {} }), getWorkerDatabase: () => ({ db: {} }) }));
vi.mock("@lobbystack/db", async importOriginal => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  withDispatcherTransaction: async (_db: unknown, callback: (tx: unknown) => unknown) => callback({ select: () => ({ from: () => ({ where: (condition: unknown) => { mocks.where(condition); return { limit: mocks.lookup }; } }) }) }),
  withBusinessTransaction: async (_db: unknown, scope: unknown, callback: (tx: unknown) => unknown) => {
    mocks.scope(scope);
    return callback({ insert: () => ({ values: (value: unknown) => { mocks.insert(value); return { onConflictDoNothing: () => ({ returning: async () => mocks.insert.mock.calls.length === 1 ? [{ id: "event-row" }] : [] }) }; } }) });
  },
  enqueueOutbox: mocks.enqueue,
}));

import { POST } from "./route";
const businessId = "ed4f1b6f-a237-4c09-8e26-68c3b976b110";
const secret = Buffer.from("polar-route-test-secret").toString("base64");

function request(reference = businessId, options: { id?: string; timestamp?: number; body?: string; signature?: string } = {}) {
  const body = options.body ?? JSON.stringify({ type: "subscription.active", data: { customer: { external_id: `business:${reference}` }, id: "sub-1", status: "active" } });
  const id = options.id ?? "delivery-1";
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = options.signature ?? `v1,${createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
  return new Request("https://app.example.test/api/webhooks/polar", { method: "POST", body, headers: { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": signature } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("POLAR_WEBHOOK_SECRET", secret);
  vi.stubEnv("POLAR_ACCEPT_LEGACY_BUSINESS_IDS", "false");
  mocks.lookup.mockResolvedValue([{ id: businessId }]);
});
afterEach(() => vi.unstubAllEnvs());

it("routes a signed UUID delivery and deduplicates retries before enqueueing", async () => {
  expect(await (await POST(request())).json()).toEqual({ accepted: true, duplicate: false, eventId: "delivery-1" });
  expect(await (await POST(request())).json()).toEqual({ accepted: true, duplicate: true, eventId: "delivery-1" });
  expect(mocks.scope).toHaveBeenCalledWith({ businessId, actorType: "worker" });
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ providerEventId: "delivery-1", businessId }));
  expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0]![0])).toMatchObject({ sql: '"businesses"."id" = $1', params: [businessId] });
});

it("resolves legacy references only with the explicit compatibility flag", async () => {
  expect(await (await POST(request("legacy-business"))).json()).toEqual({ accepted: true, ignored: true });
  expect(mocks.lookup).not.toHaveBeenCalled();
  vi.stubEnv("POLAR_ACCEPT_LEGACY_BUSINESS_IDS", "true");
  expect((await POST(request("legacy-business"))).status).toBe(200);
  expect(mocks.lookup).toHaveBeenCalledTimes(1);
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0]![0])).toMatchObject({ sql: '"businesses"."legacy_convex_id" = $1', params: ["legacy-business"] });
});

it("ignores unknown businesses without persisting or enqueueing", async () => {
  mocks.lookup.mockResolvedValue([]);
  expect(await (await POST(request())).json()).toEqual({ accepted: true, ignored: true });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.enqueue).not.toHaveBeenCalled();
});

it("rejects invalid, stale, missing, and unconfigured signatures before DB access", async () => {
  expect((await POST(request(businessId, { signature: "v1,invalid" }))).status).toBe(401);
  expect((await POST(request(businessId, { timestamp: 1 }))).status).toBe(401);
  const missing = request(); missing.headers.delete("webhook-id");
  expect((await POST(missing)).status).toBe(401);
  const tampered = request(); tampered.headers.set("webhook-id", "other-delivery");
  expect((await POST(tampered)).status).toBe(401);
  vi.stubEnv("POLAR_WEBHOOK_SECRET", "");
  expect((await POST(request())).status).toBe(401);
  expect(mocks.lookup).not.toHaveBeenCalled();
});

it("rejects malformed JSON in the verifier and invalid event envelopes in the route", async () => {
  expect((await POST(request(businessId, { body: "{" }))).status).toBe(401);
  for (const body of ["null", "[]", "{}"])
    expect((await POST(request(businessId, { body }))).status).toBe(400);
  expect(mocks.lookup).not.toHaveBeenCalled();
});
