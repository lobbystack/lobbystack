import { createHmac } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), insert: vi.fn(), enqueue: vi.fn(), scope: vi.fn(), where: vi.fn(), recordPartner: vi.fn() }));
vi.mock("@lobbystack/providers", () => import("../../../../../../packages/providers/src/polar/webhook"));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: "app" }), getDispatcherDatabase: () => ({ db: {} }), getWorkerDatabase: () => ({ db: {} }) }));
vi.mock("@lobbystack/domain", () => ({ recordPartnerPolarEvent: mocks.recordPartner }));
vi.mock("@lobbystack/db", async importOriginal => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  withDispatcherTransaction: async (_db: unknown, callback: (tx: unknown) => unknown) => callback({ select: () => ({ from: () => ({ where: (condition: unknown) => { mocks.where(condition); return { limit: mocks.lookup }; } }) }) }),
  withBusinessTransaction: async (_db: unknown, scope: unknown, callback: (tx: unknown) => unknown) => {
    mocks.scope(scope);
    return callback({ insert: () => ({ values: (value: unknown) => { mocks.insert(value); return { onConflictDoNothing: () => ({ returning: async () => mocks.insert.mock.calls.length === 1 ? [{ id: "event-row" }] : [] }) }; } }) });
  },
  enqueueOutbox: mocks.enqueue,
}));

import { selfHostedSupportCatalog } from "@lobbystack/shared";
import { POST } from "./route";
const businessId = "ed4f1b6f-a237-4c09-8e26-68c3b976b110";
const secret = Buffer.from("polar-route-test-secret").toString("base64");
let logged: MockInstance<typeof console.error>;
const unresolvedLogs = () => logged.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

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
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

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
  expect(unresolvedLogs()).toEqual([{ event: "ops.billing.webhook_unresolved", provider: "polar", eventType: "subscription.active", reason: "unknown_business", businessReference: businessId }]);
});

const premiumMonthly = selfHostedSupportCatalog.business.premium.productIds.monthly;

it.each([
  ["subscription.created", { id: "sub-9", status: "incomplete", product_id: premiumMonthly, customer: { id: "cust-9" } }],
  ["order.paid", { id: "order-9", subscription_id: "sub-9", product_id: selfHostedSupportCatalog.white_label.enterprise.productIds.annual, customer: { id: "cust-9" } }],
  ["checkout.updated", { id: "checkout-9", product: { id: selfHostedSupportCatalog.business.enterprise.productIds.annual } }],
])("accepts a self-hosted support %s that names no account without logging it as unresolved", async (type, data) => {
  const body = JSON.stringify({ type, data });
  expect(await (await POST(request(businessId, { body }))).json()).toEqual({ accepted: true, ignored: true });
  expect(mocks.lookup).not.toHaveBeenCalled();
  expect(mocks.recordPartner).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(unresolvedLogs()).toEqual([]);
});

it("logs ops.billing.support_plan_purchased once, when Polar creates a support subscription", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const purchases = () => info.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
  const created = JSON.stringify({ type: "subscription.created", data: { id: "sub-9", status: "incomplete", product_id: premiumMonthly, customer: { id: "cust-9" } } });
  const active = JSON.stringify({ type: "subscription.active", data: { id: "sub-9", status: "active", product_id: premiumMonthly, customer: { id: "cust-9" } } });
  await POST(request(businessId, { body: created }));
  await POST(request(businessId, { id: "delivery-2", body: active }));
  expect(purchases()).toEqual([{ event: "ops.billing.support_plan_purchased", provider: "polar", audience: "business", tier: "premium", billingInterval: "monthly", subscriptionId: "sub-9", customerId: "cust-9" }]);
});

it("routes a support subscription to the business its customer names, so reconcile can end that business's plan", async () => {
  // A hosted customer can switch its plan's subscription to a support product in Polar's portal.
  const body = JSON.stringify({ type: "subscription.updated", data: { id: "sub-1", status: "active", product_id: premiumMonthly, customer: { external_id: `business:${businessId}` } } });
  expect(await (await POST(request(businessId, { body }))).json()).toEqual({ accepted: true, duplicate: false, eventId: "delivery-1" });
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ businessId, payload: expect.objectContaining({ subscriptionId: "sub-1", selfHostedSupport: true }) }));
  expect(mocks.insert.mock.calls[0]![0].payload).not.toHaveProperty("plan");
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
});

it("routes a support subscription to the partner its customer names, and drops an unknown one quietly", async () => {
  const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
  const body = JSON.stringify({ type: "subscription.updated", data: { id: "sub-1", status: "active", product_id: selfHostedSupportCatalog.white_label.premium.productIds.monthly, customer: { id: "cust-1", external_id: `partner:${partnerId}` } } });
  mocks.recordPartner.mockResolvedValueOnce("stored").mockResolvedValueOnce("unknown_partner");
  expect(await (await POST(request(businessId, { body }))).json()).toEqual({ accepted: true, duplicate: false, eventId: "delivery-1" });
  expect(mocks.recordPartner).toHaveBeenCalledWith({ db: "app" }, expect.objectContaining({ partnerId, payload: expect.objectContaining({ selfHostedSupport: true }) }));
  expect(mocks.recordPartner.mock.calls[0]![1].payload).not.toHaveProperty("partnerTier");
  expect(await (await POST(request(businessId, { body }))).json()).toEqual({ accepted: true, ignored: true });
  expect(unresolvedLogs()).toEqual([]);
});

it("drops a support subscription for an unknown business without logging it as unresolved", async () => {
  mocks.lookup.mockResolvedValue([]);
  const body = JSON.stringify({ type: "subscription.active", data: { id: "sub-9", status: "active", product_id: premiumMonthly, customer: { external_id: `business:${businessId}` } } });
  expect(await (await POST(request(businessId, { body }))).json()).toEqual({ accepted: true, ignored: true });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(unresolvedLogs()).toEqual([]);
});

it("logs ops.billing.webhook_unresolved when no field identifies a business", async () => {
  // A subscription that cannot be attributed is dropped with a 200, so this
  // log line is the only trace that money moved and nothing applied.
  expect(await (await POST(request("kh797h57jgpq83314s4fj8ptmn866hbk"))).json()).toEqual({ accepted: true, ignored: true });
  expect(mocks.lookup).not.toHaveBeenCalled();
  expect(unresolvedLogs()).toEqual([{ event: "ops.billing.webhook_unresolved", provider: "polar", eventType: "subscription.active", reason: "no_reference", businessReference: "kh797h57jgpq83314s4fj8ptmn866hbk" }]);
});

it("resolves a migrated customer from metadata instead of dropping it", async () => {
  // The live failure: Polar reused a customer created before the migration, so
  // external_id still held the Convex id while metadata carried the real one.
  const body = JSON.stringify({
    type: "subscription.active",
    data: {
      id: "sub-1",
      status: "active",
      customer: {
        external_id: "business:kh797h57jgpq83314s4fj8ptmn866hbk",
        metadata: { externalCustomerId: `business:${businessId}` },
      },
    },
  });
  expect(await (await POST(request(businessId, { body }))).json()).toEqual({ accepted: true, duplicate: false, eventId: "delivery-1" });
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  expect(logged).not.toHaveBeenCalled();
});

it("stores a partner's tier events for the partner, with the tier its product sells, and never looks up a business", async () => {
  const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
  vi.stubEnv("POLAR_PARTNER_SCALE_MONTHLY_PRODUCT_ID", "scale_month");
  const body = JSON.stringify({ type: "subscription.active", data: { id: "sub-1", status: "active", product_id: "scale_month", customer: { id: "cust-1", external_id: `partner:${partnerId}` } } });
  mocks.recordPartner.mockResolvedValueOnce("stored").mockResolvedValueOnce("duplicate").mockResolvedValueOnce("unknown_partner");
  expect(await (await POST(request(businessId, { body }))).json()).toEqual({ accepted: true, duplicate: false, eventId: "delivery-1" });
  expect(mocks.recordPartner).toHaveBeenCalledWith({ db: "app" }, { partnerId, providerEventId: "delivery-1", eventType: "subscription.active", payload: expect.objectContaining({ billingKey: `partner:${partnerId}`, customerId: "cust-1", partnerTier: "scale", billingInterval: "monthly", subscriptionState: "active" }) });
  expect(await (await POST(request(businessId, { body }))).json()).toEqual({ accepted: true, duplicate: true, eventId: "delivery-1" });
  // A partner this deployment doesn't have leaves only the log line.
  expect(await (await POST(request(businessId, { body }))).json()).toEqual({ accepted: true, ignored: true });
  expect(unresolvedLogs()).toEqual([{ event: "ops.billing.webhook_unresolved", provider: "polar", eventType: "subscription.active", reason: "unknown_partner", partnerReference: `partner:${partnerId}` }]);
  expect(mocks.lookup).not.toHaveBeenCalled();
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
