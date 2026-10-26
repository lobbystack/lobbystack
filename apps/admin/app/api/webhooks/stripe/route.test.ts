import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";

import { FakeStripeConnect } from "@lobbystack/providers/stripe/fakeStripeConnect";

const fixture = vi.hoisted(() => ({ stripe: null as unknown, record: vi.fn() }));
vi.mock("@/lib/stripe-connect", () => ({ getStripeConnect: () => fixture.stripe }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: "app" }) }));
vi.mock("@lobbystack/domain", () => ({ recordStripeConnectEvent: fixture.record }));

import { POST } from "./route";

let stripe: FakeStripeConnect;
let logged: MockInstance<typeof console.error>;
const logs = () => logged.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

function delivery(type: string, accountId: string, options: { signature?: string } = {}): Request {
  const { body, signature } = stripe.delivery(type, { accountId, eventId: "evt_1", createdAt: new Date("2026-10-26T12:00:00Z") });
  const headers: Record<string, string> = options.signature === "" ? {} : { "stripe-signature": options.signature ?? signature };
  return new Request("https://desk.example.test/api/webhooks/stripe", { method: "POST", body, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  stripe = new FakeStripeConnect();
  stripe.accounts.set("acct_partner", { accountId: "acct_partner", country: "CA", currency: "CAD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, disabledReason: null });
  fixture.stripe = stripe;
  fixture.record.mockResolvedValue({ duplicate: false, applied: true, partnerId: "partner" });
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

it("records a delivery Stripe signed, as the event it carries", async () => {
  const response = await POST(delivery("account.updated", "acct_partner"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ accepted: true, duplicate: false, eventId: "evt_1" });
  expect(fixture.record).toHaveBeenCalledWith({ db: "app", stripeConnect: stripe }, {
    id: "evt_1",
    type: "account.updated",
    createdAt: new Date("2026-10-26T12:00:00Z"),
    accountId: "acct_partner",
    account: { accountId: "acct_partner", country: "CA", currency: "CAD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, disabledReason: null },
    subscriptionId: null,
    object: expect.any(Object),
  });
  expect(logged).not.toHaveBeenCalled();
});

it("answers a redelivery as a duplicate", async () => {
  fixture.record.mockResolvedValue({ duplicate: true, applied: false, partnerId: null });
  expect(await (await POST(delivery("account.updated", "acct_partner"))).json()).toEqual({ accepted: true, duplicate: true, eventId: "evt_1" });
  expect(logged).not.toHaveBeenCalled();
});

it("logs ops.billing.webhook_unresolved for an event on an account no partner has, and still accepts it", async () => {
  fixture.record.mockResolvedValue({ duplicate: false, applied: false, partnerId: null });
  expect((await POST(delivery("account.application.deauthorized", "acct_stranger"))).status).toBe(200);
  expect(logs()).toEqual([{ event: "ops.billing.webhook_unresolved", provider: "stripe", eventType: "account.application.deauthorized", reason: "unknown_account", accountId: "acct_stranger" }]);
});

it("reconciles a subscription event through the same recorder, and logs one that names none of the partner's businesses", async () => {
  fixture.record.mockResolvedValue({ duplicate: false, applied: false, partnerId: "partner", businessId: null });
  const { body, signature } = stripe.delivery("customer.subscription.updated", { accountId: "acct_partner", eventId: "evt_2", object: { id: "sub_1", object: "subscription", status: "active" } });
  const response = await POST(new Request("https://desk.example.test/api/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": signature } }));
  expect(response.status).toBe(200);
  expect(fixture.record).toHaveBeenCalledWith({ db: "app", stripeConnect: stripe }, expect.objectContaining({ type: "customer.subscription.updated", subscriptionId: "sub_1" }));
  expect(logs()).toEqual([{ event: "ops.billing.webhook_unresolved", provider: "stripe", eventType: "customer.subscription.updated", reason: "unknown_business", accountId: "acct_partner", subscriptionId: "sub_1" }]);
});

it("logs a subscription that pays for a package its business isn't on", async () => {
  fixture.record.mockResolvedValue({ duplicate: false, applied: false, partnerId: "partner", businessId: "business", otherPackage: true });
  const { body, signature } = stripe.delivery("checkout.session.completed", { accountId: "acct_partner", eventId: "evt_3", object: { id: "cs_1", object: "checkout.session", mode: "subscription", subscription: "sub_2" } });
  expect((await POST(new Request("https://desk.example.test/api/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": signature } }))).status).toBe(200);
  expect(logs()).toEqual([{ event: "ops.billing.webhook_unresolved", provider: "stripe", eventType: "checkout.session.completed", reason: "other_package", accountId: "acct_partner", subscriptionId: "sub_2" }]);
});

it("refuses a delivery whose signature is missing or wrong, and every delivery without Stripe Connect, before reading the database", async () => {
  expect((await POST(delivery("account.updated", "acct_partner", { signature: "" }))).status).toBe(401);
  expect((await POST(delivery("account.updated", "acct_partner", { signature: "fake=forged" }))).status).toBe(401);
  fixture.stripe = null;
  expect((await POST(delivery("account.updated", "acct_partner"))).status).toBe(401);
  expect(fixture.record).not.toHaveBeenCalled();
});

it("asks Stripe to retry when recording fails", async () => {
  fixture.record.mockRejectedValue(new Error("database down"));
  const response = await POST(delivery("account.updated", "acct_partner"));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Webhook processing failed." });
});
