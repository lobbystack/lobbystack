import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeStripeConnect } from "./fakeStripeConnect";
import { createStripeConnectProvider, overageMeterValue, overageUnitAmount, StripeConnectAdapter, stripeUnitAmount } from "./stripeConnect";

// The adapter talks to Stripe through a fetch that answers here, so these
// tests see each request it sends, headers included, and never reach Stripe.

type SentRequest = { method: string; path: string; params: URLSearchParams; headers: Headers };

const webhookSecret = "whsec_test_partner_connect";

function stripeAnswering(answer: (request: SentRequest) => Record<string, unknown>) {
  const sent: SentRequest[] = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const request = { method: init?.method ?? "GET", path: url.pathname, params: new URLSearchParams(init?.body ? String(init.body) : url.search), headers: new Headers(init?.headers as HeadersInit) };
    sent.push(request);
    return Response.json(answer(request));
  });
  const adapter = new StripeConnectAdapter({ secretKey: "sk_test_platform", webhookSecret, httpClient: Stripe.createFetchHttpClient(fetchFn as typeof fetch) });
  return { adapter, sent };
}

const stripeAccount = { id: "acct_partner", object: "account", country: "ca", default_currency: "cad", details_submitted: true, charges_enabled: true, payouts_enabled: false, requirements: { disabled_reason: null } };

afterEach(() => { vi.unstubAllEnvs(); });

describe("the Stripe Connect adapter", () => {
  it("creates a partner's account with the full Dashboard in the country it chose, then links to Stripe's onboarding", async () => {
    const { adapter, sent } = stripeAnswering((request) => request.path === "/v1/accounts" ? { ...stripeAccount, id: "acct_new" } : { object: "account_link", url: "https://connect.stripe.com/setup/s/abc" });
    const link = await adapter.createOnboardingLink({ accountId: null, country: "CA", idempotencyKey: "partner-stripe-account:p1:first:CA", returnUrl: "https://acme.portal.test/partner/p1/stripe?onboarding=return", refreshUrl: "https://acme.portal.test/partner/p1/stripe?onboarding=refresh", metadata: { lobbystack_partner_id: "p1" } });

    expect(link).toEqual({ accountId: "acct_new", url: "https://connect.stripe.com/setup/s/abc" });
    const [create, accountLink] = sent;
    expect(create).toMatchObject({ method: "POST", path: "/v1/accounts" });
    expect(create!.headers.get("idempotency-key")).toBe("partner-stripe-account:p1:first:CA");
    expect(Object.fromEntries(create!.params)).toEqual({
      country: "CA",
      "controller[stripe_dashboard][type]": "full",
      "controller[fees][payer]": "account",
      "controller[losses][payments]": "stripe",
      "controller[requirement_collection]": "stripe",
      "metadata[lobbystack_partner_id]": "p1",
    });
    expect(accountLink).toMatchObject({ method: "POST", path: "/v1/account_links" });
    expect(Object.fromEntries(accountLink!.params)).toEqual({ account: "acct_new", type: "account_onboarding", return_url: "https://acme.portal.test/partner/p1/stripe?onboarding=return", refresh_url: "https://acme.portal.test/partner/p1/stripe?onboarding=refresh" });
    // Onboarding acts on the platform, never as the connected account.
    expect(sent.every((request) => request.headers.get("stripe-account") === null)).toBe(true);
  });

  it("links an account it already made straight to onboarding, without creating another", async () => {
    const { adapter, sent } = stripeAnswering(() => ({ object: "account_link", url: "https://connect.stripe.com/setup/s/again" }));
    expect(await adapter.createOnboardingLink({ accountId: "acct_partner", country: null, idempotencyKey: "unused", returnUrl: "https://desk.test/r", refreshUrl: "https://desk.test/f", metadata: {} })).toEqual({ accountId: "acct_partner", url: "https://connect.stripe.com/setup/s/again" });
    expect(sent.map((request) => request.path)).toEqual(["/v1/account_links"]);
  });

  it("reads an account's state, with its country and currency in uppercase", async () => {
    const { adapter, sent } = stripeAnswering(() => stripeAccount);
    expect(await adapter.retrieveAccount("acct_partner")).toEqual({ accountId: "acct_partner", country: "CA", currency: "CAD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: false, disabledReason: null });
    expect(sent[0]).toMatchObject({ method: "GET", path: "/v1/accounts/acct_partner" });
  });

  it("creates a package's product, monthly price and setup fee on the partner's own account", async () => {
    const { adapter, sent } = stripeAnswering((request) => request.path === "/v1/products" ? { id: "prod_1", object: "product" } : { id: request.params.get("recurring[interval]") ? "price_monthly" : "price_setup", object: "price" });
    const prices = await adapter.upsertPackagePrice("acct_partner", { packageId: "pkg1", name: "Front desk", currency: "CAD", monthlyPriceMinor: 14900, setupFeeMinor: 5000, active: true, prices: null });

    expect(prices).toEqual({ productId: "prod_1", priceId: "price_monthly", setupPriceId: "price_setup" });
    expect(sent.map((request) => [request.path, request.headers.get("stripe-account"), request.headers.get("idempotency-key")])).toEqual([
      ["/v1/products", "acct_partner", "package:pkg1:product"],
      ["/v1/prices", "acct_partner", "package:pkg1:monthly"],
      ["/v1/prices", "acct_partner", "package:pkg1:setup"],
    ]);
    expect(Object.fromEntries(sent[1]!.params)).toMatchObject({ product: "prod_1", currency: "cad", unit_amount: "14900", "recurring[interval]": "month" });
    expect(Object.fromEntries(sent[2]!.params)).toMatchObject({ product: "prod_1", currency: "cad", unit_amount: "5000" });
    expect(sent[2]!.params.has("recurring[interval]")).toBe(false);
  });

  it("makes no setup price for a package without a setup fee", async () => {
    const { adapter, sent } = stripeAnswering((request) => ({ id: request.path === "/v1/products" ? "prod_1" : "price_monthly" }));
    expect(await adapter.upsertPackagePrice("acct_partner", { packageId: "pkg1", name: "Front desk", currency: "JPY", monthlyPriceMinor: 9800, setupFeeMinor: null, active: true, prices: null })).toEqual({ productId: "prod_1", priceId: "price_monthly", setupPriceId: null });
    expect(sent).toHaveLength(2);
    expect(sent[1]!.params.get("unit_amount")).toBe("9800");
  });

  it("renames a package's product, and takes its prices off sale before the product when it stops selling", async () => {
    const { adapter, sent } = stripeAnswering(() => ({ id: "x" }));
    const prices = { productId: "prod_1", priceId: "price_monthly", setupPriceId: "price_setup" };
    expect(await adapter.upsertPackagePrice("acct_partner", { packageId: "pkg1", name: "Front desk plus", currency: "CAD", monthlyPriceMinor: 14900, setupFeeMinor: 5000, active: false, prices })).toEqual(prices);
    expect(sent.map((request) => [request.path, Object.fromEntries(request.params), request.headers.get("stripe-account")])).toEqual([
      ["/v1/prices/price_monthly", { active: "false" }, "acct_partner"],
      ["/v1/prices/price_setup", { active: "false" }, "acct_partner"],
      ["/v1/products/prod_1", { name: "Front desk plus", active: "false" }, "acct_partner"],
    ]);
  });

  it("accepts a Connect delivery Stripe signed, reading the account it describes, and refuses any other", async () => {
    const { adapter } = stripeAnswering(() => ({}));
    const body = JSON.stringify({ id: "evt_1", object: "event", type: "account.updated", created: 1_793_000_000, account: "acct_partner", data: { object: stripeAccount } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret });

    expect(adapter.verifyWebhook(body, signature)).toEqual({
      id: "evt_1",
      type: "account.updated",
      createdAt: new Date(1_793_000_000 * 1000),
      accountId: "acct_partner",
      account: { accountId: "acct_partner", country: "CA", currency: "CAD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: false, disabledReason: null },
      subscriptionId: null,
      object: stripeAccount,
    });
    expect(() => adapter.verifyWebhook(body, Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_someone_else" }))).toThrow();
    expect(() => adapter.verifyWebhook(body.replace("acct_partner", "acct_other"), signature)).toThrow();
    expect(() => adapter.verifyWebhook(body, "")).toThrow();
  });

  it("reads a disconnection's account from the event, since its object is the application", () => {
    const { adapter } = stripeAnswering(() => ({}));
    const body = JSON.stringify({ id: "evt_2", object: "event", type: "account.application.deauthorized", created: 1_793_000_100, account: "acct_partner", data: { object: { id: "ca_platform", object: "application" } } });
    expect(adapter.verifyWebhook(body, Stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret }))).toMatchObject({ type: "account.application.deauthorized", accountId: "acct_partner", account: null });
  });

  it("opens a subscription checkout on the partner's account for the package's monthly price and setup fee, naming the business", async () => {
    const { adapter, sent } = stripeAnswering(() => ({ id: "cs_test_1", object: "checkout.session", url: "https://checkout.stripe.com/c/pay/cs_test_1", expires_at: 1_793_086_400 }));
    const checkout = await adapter.createCheckout("acct_partner", {
      priceId: "price_monthly",
      setupPriceId: "price_setup",
      customerId: null,
      customerEmail: "owner@harbor.example",
      successUrl: "https://acme.portal.test/accept-invite?token=t&checkout=complete",
      cancelUrl: "https://acme.portal.test/accept-invite?token=t&checkout=canceled",
      idempotencyKey: "package-checkout:b1:pkg1:first",
      clientReferenceId: "b1",
      metadata: { lobbystack_business_id: "b1", lobbystack_package_id: "pkg1" },
    });

    expect(checkout).toEqual({ sessionId: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", expiresAt: new Date(1_793_086_400 * 1000) });
    const [request] = sent;
    expect(request).toMatchObject({ method: "POST", path: "/v1/checkout/sessions" });
    // A direct charge: the checkout, its subscription and its payments all live on the partner's account.
    expect(request!.headers.get("stripe-account")).toBe("acct_partner");
    expect(request!.headers.get("idempotency-key")).toBe("package-checkout:b1:pkg1:first");
    expect(Object.fromEntries(request!.params)).toEqual({
      mode: "subscription",
      "line_items[0][price]": "price_monthly",
      "line_items[0][quantity]": "1",
      "line_items[1][price]": "price_setup",
      "line_items[1][quantity]": "1",
      customer_email: "owner@harbor.example",
      client_reference_id: "b1",
      "metadata[lobbystack_business_id]": "b1",
      "metadata[lobbystack_package_id]": "pkg1",
      "subscription_data[metadata][lobbystack_business_id]": "b1",
      "subscription_data[metadata][lobbystack_package_id]": "pkg1",
      // Renews on the 1st at 00:00 UTC, with a partial first month.
      "subscription_data[billing_cycle_anchor_config][day_of_month]": "1",
      "subscription_data[billing_cycle_anchor_config][hour]": "0",
      "subscription_data[billing_cycle_anchor_config][minute]": "0",
      "subscription_data[billing_cycle_anchor_config][second]": "0",
      "subscription_data[proration_behavior]": "create_prorations",
      success_url: "https://acme.portal.test/accept-invite?token=t&checkout=complete",
      cancel_url: "https://acme.portal.test/accept-invite?token=t&checkout=canceled",
      locale: "auto",
      integration_identifier: expect.stringMatching(/^lobbystack_package_checkout_[a-z]{8}$/),
    });
    // No application fee: the partner keeps the whole payment.
    expect([...request!.params.keys()].some((key) => key.includes("application_fee"))).toBe(false);
  });

  it("charges an earlier customer again instead of making a new one, and sells no setup fee a package doesn't have", async () => {
    const { adapter, sent } = stripeAnswering(() => ({ id: "cs_test_2", url: "https://checkout.stripe.com/c/pay/cs_test_2", expires_at: 1_793_086_400 }));
    await adapter.createCheckout("acct_partner", { priceId: "price_monthly", setupPriceId: null, customerId: "cus_1", customerEmail: "owner@harbor.example", successUrl: "https://a.test/s", cancelUrl: "https://a.test/c", idempotencyKey: "k", clientReferenceId: "b1", metadata: {} });
    const params = Object.fromEntries(sent[0]!.params);
    expect(params).toMatchObject({ customer: "cus_1", "line_items[0][price]": "price_monthly" });
    expect(params).not.toHaveProperty("customer_email");
    expect(params).not.toHaveProperty("line_items[1][price]");
  });

  it("closes a checkout, opens the customer portal and reads a subscription, each on the partner's account", async () => {
    const subscription = { id: "sub_1", object: "subscription", status: "past_due", customer: "cus_1", metadata: { lobbystack_business_id: "b1" }, items: { object: "list", data: [{ id: "si_1", current_period_end: 1_795_000_000 }, { id: "si_2", current_period_end: 1_794_000_000 }] } };
    const { adapter, sent } = stripeAnswering((request) => request.path.startsWith("/v1/subscriptions") ? subscription : request.path.startsWith("/v1/billing_portal") ? { id: "bps_1", url: "https://billing.stripe.com/p/session/x" } : { id: "cs_test_1", status: "expired" });

    await adapter.expireCheckout("acct_partner", "cs_test_1");
    expect(await adapter.createPortal("acct_partner", "cus_1", "https://acme.portal.test/settings/subscription")).toEqual({ url: "https://billing.stripe.com/p/session/x" });
    expect(await adapter.retrieveSubscription("acct_partner", "sub_1")).toEqual({ subscriptionId: "sub_1", customerId: "cus_1", status: "past_due", currentPeriodEnd: new Date(1_795_000_000 * 1000), metadata: { lobbystack_business_id: "b1" } });

    expect(sent.map((request) => [request.method, request.path, request.headers.get("stripe-account")])).toEqual([
      ["POST", "/v1/checkout/sessions/cs_test_1/expire", "acct_partner"],
      ["POST", "/v1/billing_portal/sessions", "acct_partner"],
      ["GET", "/v1/subscriptions/sub_1", "acct_partner"],
    ]);
    expect(Object.fromEntries(sent[1]!.params)).toEqual({ customer: "cus_1", return_url: "https://acme.portal.test/settings/subscription" });
  });

  it("cancels a subscription now on the partner's account, and leaves one that already ended as it is", async () => {
    const live = { id: "sub_1", object: "subscription", status: "active", customer: "cus_1", metadata: { lobbystack_business_id: "b1" }, items: { object: "list", data: [{ id: "si_1", current_period_end: 1_795_000_000 }] } };
    const { adapter, sent } = stripeAnswering((request) => request.method === "DELETE" ? { ...live, status: "canceled" } : live);
    expect(await adapter.cancelSubscription("acct_partner", "sub_1")).toEqual({ subscriptionId: "sub_1", customerId: "cus_1", status: "canceled", currentPeriodEnd: new Date(1_795_000_000 * 1000), metadata: { lobbystack_business_id: "b1" } });
    expect(sent.map((request) => [request.method, request.path, request.headers.get("stripe-account")])).toEqual([
      ["GET", "/v1/subscriptions/sub_1", "acct_partner"],
      ["DELETE", "/v1/subscriptions/sub_1", "acct_partner"],
    ]);

    const ended = stripeAnswering(() => ({ ...live, status: "canceled" }));
    expect(await ended.adapter.cancelSubscription("acct_partner", "sub_1")).toMatchObject({ status: "canceled" });
    expect(ended.sent.map((request) => request.method)).toEqual(["GET"]);
  });

  it("names the subscription each billing event is about", () => {
    const { adapter } = stripeAnswering(() => ({}));
    const signed = (type: string, object: Record<string, unknown>) => {
      const body = JSON.stringify({ id: `evt_${type}`, object: "event", type, created: 1_793_000_000, account: "acct_partner", data: { object } });
      return adapter.verifyWebhook(body, Stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret }));
    };
    expect(signed("checkout.session.completed", { id: "cs_1", object: "checkout.session", mode: "subscription", subscription: "sub_1" }).subscriptionId).toBe("sub_1");
    expect(signed("checkout.session.completed", { id: "cs_2", object: "checkout.session", mode: "payment", subscription: null }).subscriptionId).toBeNull();
    expect(signed("customer.subscription.deleted", { id: "sub_2", object: "subscription", status: "canceled" }).subscriptionId).toBe("sub_2");
    expect(signed("invoice.payment_failed", { id: "in_1", object: "invoice", parent: { type: "subscription_details", subscription_details: { subscription: "sub_3" } } }).subscriptionId).toBe("sub_3");
    expect(signed("account.updated", stripeAccount).subscriptionId).toBeNull();
  });

  it("bills a business's overage on its subscription: the account's meter and price, made the first time, and an item for the price", async () => {
    const { adapter, sent } = stripeAnswering((request) => {
      if (request.path === "/v1/subscriptions/sub_1") return { id: "sub_1", object: "subscription", currency: "cad", items: { object: "list", data: [{ id: "si_monthly", price: { id: "price_monthly", recurring: { interval: "month", meter: null } } }], has_more: false } };
      if (request.path === "/v1/billing/meters" && request.method === "GET") return { object: "list", data: [{ id: "mtr_partner", object: "billing.meter", event_name: "partner_own_meter", status: "active" }], has_more: false, url: "/v1/billing/meters" };
      if (request.path === "/v1/billing/meters") return { id: "mtr_calls", object: "billing.meter", event_name: "lobbystack_call_overage", status: "active" };
      if (request.path === "/v1/prices" && request.method === "GET") return { object: "list", data: [], has_more: false, url: "/v1/prices" };
      if (request.path === "/v1/prices") return { id: "price_calls", object: "price" };
      return { id: "si_calls", object: "subscription_item" };
    });

    expect(await adapter.addOverageToSubscription("acct_partner", { subscriptionId: "sub_1", meter: "voice", currency: "CAD" })).toEqual({ subscriptionItemId: "si_calls" });
    // Everything happens on the partner's own account.
    expect(sent.map((request) => [request.method, request.path, request.headers.get("stripe-account"), request.headers.get("idempotency-key")])).toEqual([
      ["GET", "/v1/subscriptions/sub_1", "acct_partner", null],
      ["GET", "/v1/billing/meters", "acct_partner", null],
      ["POST", "/v1/billing/meters", "acct_partner", "overage-meter:voice"],
      ["GET", "/v1/prices", "acct_partner", null],
      ["POST", "/v1/prices", "acct_partner", "overage-price:voice:CAD"],
      ["POST", "/v1/subscription_items", "acct_partner", "overage-item:sub_1:voice"],
    ]);
    // The meter sums what the overage costs, by the customer each event names.
    expect(Object.fromEntries(sent[2]!.params)).toEqual({
      display_name: "Call overage",
      event_name: "lobbystack_call_overage",
      "default_aggregation[formula]": "sum",
      "customer_mapping[type]": "by_id",
      "customer_mapping[event_payload_key]": "stripe_customer_id",
      "value_settings[event_payload_key]": "value",
    });
    // The lookup key finds the price whether or not the partner archived it.
    expect(Object.fromEntries(sent[3]!.params)).toEqual({ "lookup_keys[0]": "lobbystack_voice_overage_cad", limit: "1", "expand[0]": "data.product" });
    // Its price charges one dollar for each dollar the meter counts, each month.
    expect(Object.fromEntries(sent[4]!.params)).toEqual({
      currency: "cad",
      unit_amount: "100",
      "recurring[interval]": "month",
      "recurring[usage_type]": "metered",
      "recurring[meter]": "mtr_calls",
      "product_data[name]": "Call overage",
      "product_data[metadata][lobbystack_overage]": "voice",
      lookup_key: "lobbystack_voice_overage_cad",
      "metadata[lobbystack_overage]": "voice",
    });
    expect(Object.fromEntries(sent[5]!.params)).toEqual({ subscription: "sub_1", price: "price_calls", proration_behavior: "none" });
  });

  it("finds the meter, price and item it made before, and counts a meter the partner deactivated again", async () => {
    const meters = { object: "list", data: [{ id: "mtr_chats", object: "billing.meter", event_name: "lobbystack_chat_overage", status: "inactive" }], has_more: false, url: "/v1/billing/meters" };
    const billed = stripeAnswering((request) => request.path === "/v1/subscriptions/sub_1"
      ? { id: "sub_1", object: "subscription", currency: "jpy", items: { object: "list", data: [{ id: "si_chats", price: { id: "price_chats", recurring: { interval: "month", meter: "mtr_chats" } } }], has_more: false } }
      : request.path === "/v1/billing/meters" ? meters : { id: "mtr_chats", object: "billing.meter", status: "active" });
    expect(await billed.adapter.addOverageToSubscription("acct_partner", { subscriptionId: "sub_1", meter: "chat", currency: "JPY" })).toEqual({ subscriptionItemId: "si_chats" });
    expect(billed.sent.map((request) => [request.method, request.path])).toEqual([["GET", "/v1/subscriptions/sub_1"], ["GET", "/v1/billing/meters"], ["POST", "/v1/billing/meters/mtr_chats/reactivate"]]);

    // Another subscription on the same account gets the price the first one made.
    const another = stripeAnswering((request) => {
      if (request.path === "/v1/subscriptions/sub_2") return { id: "sub_2", object: "subscription", currency: "jpy", items: { object: "list", data: [], has_more: false } };
      if (request.path === "/v1/billing/meters") return { ...meters, data: [{ ...meters.data[0], status: "active" }] };
      if (request.path === "/v1/prices") return { object: "list", data: [{ id: "price_chats", object: "price", active: true, product: { id: "prod_chats", object: "product", active: true } }], has_more: false, url: "/v1/prices" };
      return { id: "si_new", object: "subscription_item" };
    });
    expect(await another.adapter.addOverageToSubscription("acct_partner", { subscriptionId: "sub_2", meter: "chat", currency: "JPY" })).toEqual({ subscriptionItemId: "si_new" });
    expect(another.sent.map((request) => [request.method, request.path])).toEqual([["GET", "/v1/subscriptions/sub_2"], ["GET", "/v1/billing/meters"], ["GET", "/v1/prices"], ["POST", "/v1/subscription_items"]]);
    expect(Object.fromEntries(another.sent[3]!.params)).toEqual({ subscription: "sub_2", price: "price_chats", proration_behavior: "none" });
  });

  it("puts a price and product the partner archived back on sale, rather than make a price its lookup key can't name", async () => {
    const { adapter, sent } = stripeAnswering((request) => {
      if (request.path === "/v1/subscriptions/sub_3") return { id: "sub_3", object: "subscription", currency: "cad", items: { object: "list", data: [], has_more: false } };
      if (request.path === "/v1/billing/meters") return { object: "list", data: [{ id: "mtr_calls", object: "billing.meter", event_name: "lobbystack_call_overage", status: "active" }], has_more: false, url: "/v1/billing/meters" };
      if (request.path === "/v1/prices" && request.method === "GET") return { object: "list", data: [{ id: "price_calls", object: "price", active: false, product: { id: "prod_calls", object: "product", active: false } }], has_more: false, url: "/v1/prices" };
      if (request.path === "/v1/products/prod_calls") return { id: "prod_calls", object: "product", active: true };
      if (request.path === "/v1/prices/price_calls") return { id: "price_calls", object: "price", active: true };
      return { id: "si_calls", object: "subscription_item" };
    });
    expect(await adapter.addOverageToSubscription("acct_partner", { subscriptionId: "sub_3", meter: "voice", currency: "CAD" })).toEqual({ subscriptionItemId: "si_calls" });
    expect(sent.map((request) => [request.method, request.path, request.headers.get("stripe-account")])).toEqual([
      ["GET", "/v1/subscriptions/sub_3", "acct_partner"],
      ["GET", "/v1/billing/meters", "acct_partner"],
      ["GET", "/v1/prices", "acct_partner"],
      ["POST", "/v1/products/prod_calls", "acct_partner"],
      ["POST", "/v1/prices/price_calls", "acct_partner"],
      ["POST", "/v1/subscription_items", "acct_partner"],
    ]);
    expect(Object.fromEntries(sent[3]!.params)).toEqual({ active: "true" });
    expect(Object.fromEntries(sent[4]!.params)).toEqual({ active: "true" });
    expect(Object.fromEntries(sent[5]!.params)).toEqual({ subscription: "sub_3", price: "price_calls", proration_behavior: "none" });
  });

  it("refuses to bill overage in another currency than the subscription's", async () => {
    const { adapter, sent } = stripeAnswering(() => ({ id: "sub_1", object: "subscription", currency: "usd", items: { object: "list", data: [], has_more: false } }));
    await expect(adapter.addOverageToSubscription("acct_partner", { subscriptionId: "sub_1", meter: "voice", currency: "CAD" })).rejects.toMatchObject({ code: "currency_mismatch" });
    expect(sent).toHaveLength(1);
  });

  it("reports overage as a meter event on the partner's account, under its identifier, in the currency's major unit", async () => {
    const { adapter, sent } = stripeAnswering(() => ({ object: "billing.meter_event", identifier: "voice:call-1" }));
    await adapter.reportOverage("acct_partner", { identifier: "voice:call-1", customerId: "cus_1", meter: "voice", amountMinor: 1_237.5, currency: "CAD" });
    const [request] = sent;
    expect(request).toMatchObject({ method: "POST", path: "/v1/billing/meter_events" });
    expect(request!.headers.get("stripe-account")).toBe("acct_partner");
    expect(request!.headers.get("idempotency-key")).toBe("overage-report:voice:call-1");
    expect(Object.fromEntries(request!.params)).toEqual({ event_name: "lobbystack_call_overage", identifier: "voice:call-1", "payload[stripe_customer_id]": "cus_1", "payload[value]": "12.375" });

    await adapter.reportOverage("acct_partner", { identifier: "chat:conversation-1", customerId: "cus_1", meter: "chat", amountMinor: 20, currency: "JPY" });
    expect(Object.fromEntries(sent[1]!.params)).toMatchObject({ event_name: "lobbystack_chat_overage", "payload[value]": "20" });
  });

  it("takes a report Stripe already counted as sent, and lets any other refusal through for a retry", async () => {
    const refusing = (code: string) => {
      const fetchFn = vi.fn(async () => Response.json({ error: { type: "invalid_request_error", code, message: "A meter event with this identifier was already submitted." } }, { status: 400 }));
      return new StripeConnectAdapter({ secretKey: "sk_test_platform", webhookSecret, httpClient: Stripe.createFetchHttpClient(fetchFn as typeof fetch) });
    };
    const report = { identifier: "voice:call-1", customerId: "cus_1", meter: "voice" as const, amountMinor: 100, currency: "USD" };
    await expect(refusing("duplicate_meter_event").reportOverage("acct_partner", report)).resolves.toBeUndefined();
    await expect(refusing("resource_missing").reportOverage("acct_partner", report)).rejects.toMatchObject({ code: "resource_missing" });
  });

  it("refuses a live key in a certification run", () => {
    vi.stubEnv("LOBBYSTACK_CERTIFICATION_MODE", "true");
    expect(() => new StripeConnectAdapter({ secretKey: "sk_live_platform", webhookSecret })).toThrow("CERTIFICATION_REQUIRES_BILLING_SANDBOX");
    expect(() => new StripeConnectAdapter({ secretKey: "rk_test_platform", webhookSecret })).not.toThrow();
  });
});

describe("the deployment's Stripe Connect client", () => {
  it("exists only when the key and the webhook secret are both set", () => {
    expect(createStripeConnectProvider({})).toBeNull();
    expect(createStripeConnectProvider({ STRIPE_CONNECT_SECRET_KEY: "sk_test_platform" })).toBeNull();
    expect(createStripeConnectProvider({ STRIPE_CONNECT_SECRET_KEY: "sk_test_platform", STRIPE_CONNECT_WEBHOOK_SECRET: " " })).toBeNull();
    expect(createStripeConnectProvider({ STRIPE_CONNECT_SECRET_KEY: "sk_test_platform", STRIPE_CONNECT_WEBHOOK_SECRET: webhookSecret })).toBeInstanceOf(StripeConnectAdapter);
  });
});

describe("Stripe amounts", () => {
  it("sends most currencies' amounts as LobbyStack stores them", () => {
    expect(stripeUnitAmount(4900, "USD")).toBe(4900);
    expect(stripeUnitAmount(9800, "JPY")).toBe(9800);
    expect(stripeUnitAmount(12_500, "KWD")).toBe(12_500);
  });

  it("follows Stripe where it differs from ISO 4217", () => {
    expect(stripeUnitAmount(5000, "ISK")).toBe(500_000);
    expect(stripeUnitAmount(5000, "UGX")).toBe(500_000);
    expect(stripeUnitAmount(500_000, "MGA")).toBe(5000);
    expect(() => stripeUnitAmount(500_050, "MGA")).toThrow(/whole units/);
  });

  it("counts overage in the currency's major unit, whose price is one major unit", () => {
    expect(overageMeterValue(1_237.5, "USD")).toBe("12.375");
    expect(overageMeterValue(1_200, "USD")).toBe("12");
    expect(overageMeterValue(-50, "EUR")).toBe("-0.5");
    expect(overageMeterValue(250, "JPY")).toBe("250");
    expect(overageMeterValue(1_234, "KWD")).toBe("1.234");
    // A third of a cent keeps four places past the cent.
    expect(overageMeterValue(1 / 3, "USD")).toBe("0.003333");
    expect(overageMeterValue(1e-9, "USD")).toBe("0");
    expect([overageUnitAmount("USD"), overageUnitAmount("JPY"), overageUnitAmount("KWD"), overageUnitAmount("ISK"), overageUnitAmount("MGA")]).toEqual([100, 1, 1_000, 100, 1]);
  });
});

describe("the fake Stripe", () => {
  it("gives the same account for the same idempotency key, as Stripe does", async () => {
    const stripe = new FakeStripeConnect();
    const input = { accountId: null, country: "US", idempotencyKey: "key", returnUrl: "https://desk.test/r", refreshUrl: "https://desk.test/f", metadata: {} };
    const first = await stripe.createOnboardingLink(input);
    expect((await stripe.createOnboardingLink(input)).accountId).toBe(first.accountId);
    expect((await stripe.createOnboardingLink({ ...input, idempotencyKey: "other" })).accountId).not.toBe(first.accountId);
  });

  it("starts a subscription when a checkout is paid, on the same customer as before when the checkout named one", async () => {
    const stripe = new FakeStripeConnect();
    const { accountId } = await stripe.createOnboardingLink({ accountId: null, country: "US", idempotencyKey: "key", returnUrl: "https://desk.test/r", refreshUrl: "https://desk.test/f", metadata: {} });
    const prices = await stripe.upsertPackagePrice(accountId, { packageId: "pkg1", name: "Front desk", currency: "USD", monthlyPriceMinor: 4900, setupFeeMinor: null, active: true, prices: null });
    const input = { priceId: prices.priceId, setupPriceId: null, customerId: null, customerEmail: "owner@harbor.example", successUrl: "https://a.test/s", cancelUrl: "https://a.test/c", idempotencyKey: "first", clientReferenceId: "b1", metadata: { lobbystack_business_id: "b1" } };
    const checkout = await stripe.createCheckout(accountId, input);
    expect((await stripe.createCheckout(accountId, input)).sessionId).toBe(checkout.sessionId);

    const subscription = stripe.completeCheckout(checkout.sessionId);
    expect(await stripe.retrieveSubscription(accountId, subscription.subscriptionId)).toMatchObject({ status: "active", metadata: { lobbystack_business_id: "b1" } });
    const { body, signature } = stripe.delivery("checkout.session.completed", { accountId, object: stripe.checkoutObject(checkout.sessionId) });
    expect(stripe.verifyWebhook(body, signature).subscriptionId).toBe(subscription.subscriptionId);

    const again = await stripe.createCheckout(accountId, { ...input, customerId: subscription.customerId, idempotencyKey: "second" });
    expect(stripe.completeCheckout(again.sessionId).customerId).toBe(subscription.customerId);
    await expect(stripe.retrieveSubscription("acct_other", subscription.subscriptionId)).rejects.toMatchObject({ statusCode: 404 });

    // Cancelling ends it at once, and cancelling it again changes nothing.
    await expect(stripe.cancelSubscription("acct_other", subscription.subscriptionId)).rejects.toMatchObject({ statusCode: 404 });
    expect(await stripe.cancelSubscription(accountId, subscription.subscriptionId)).toMatchObject({ subscriptionId: subscription.subscriptionId, status: "canceled" });
    expect(await stripe.cancelSubscription(accountId, subscription.subscriptionId)).toMatchObject({ status: "canceled" });
    expect(await stripe.retrieveSubscription(accountId, subscription.subscriptionId)).toMatchObject({ status: "canceled" });
  });

  it("bills overage a subscription has an item for, and counts each identifier once", async () => {
    const stripe = new FakeStripeConnect();
    const { accountId } = await stripe.createOnboardingLink({ accountId: null, country: "US", idempotencyKey: "key", returnUrl: "https://desk.test/r", refreshUrl: "https://desk.test/f", metadata: {} });
    const prices = await stripe.upsertPackagePrice(accountId, { packageId: "pkg1", name: "Front desk", currency: "USD", monthlyPriceMinor: 4900, setupFeeMinor: null, active: true, prices: null });
    const checkout = await stripe.createCheckout(accountId, { priceId: prices.priceId, setupPriceId: null, customerId: null, customerEmail: null, successUrl: "https://a.test/s", cancelUrl: "https://a.test/c", idempotencyKey: "first", clientReferenceId: "b1", metadata: {} });
    const subscription = stripe.completeCheckout(checkout.sessionId);
    const report = { identifier: "voice:call-1", customerId: subscription.customerId, meter: "voice" as const, amountMinor: 1_237.5, currency: "USD" };

    // No meter yet, so no report lands.
    await expect(stripe.reportOverage(accountId, report)).rejects.toMatchObject({ statusCode: 400 });
    await expect(stripe.addOverageToSubscription(accountId, { subscriptionId: subscription.subscriptionId, meter: "voice", currency: "EUR" })).rejects.toMatchObject({ code: "currency_mismatch" });
    const item = await stripe.addOverageToSubscription(accountId, { subscriptionId: subscription.subscriptionId, meter: "voice", currency: "USD" });
    expect(await stripe.addOverageToSubscription(accountId, { subscriptionId: subscription.subscriptionId, meter: "voice", currency: "USD" })).toEqual(item);

    await stripe.reportOverage(accountId, report);
    await stripe.reportOverage(accountId, report);
    await stripe.reportOverage(accountId, { ...report, identifier: "voice:call-1:2", amountMinor: -37.5 });
    expect(stripe.meterEvents.map((event) => [event.identifier, event.value])).toEqual([["voice:call-1", "12.375"], ["voice:call-1:2", "-0.375"]]);
    expect(stripe.overageBilled(accountId, subscription.customerId, "voice")).toBe(1_200);
    // Chats have no item on the subscription, so nothing bills them.
    expect(stripe.overageBilled(accountId, subscription.customerId, "chat")).toBe(0);

    // The partner archives the call overage price in its Dashboard: the next subscription puts it back on sale, and makes no second one.
    const [priceId, price] = [...stripe.prices].find(([, candidate]) => candidate.meterId !== undefined)!;
    stripe.prices.set(priceId, { ...price, active: false });
    stripe.products.set(price.productId, { ...stripe.products.get(price.productId)!, active: false });
    const again = await stripe.createCheckout(accountId, { priceId: prices.priceId, setupPriceId: null, customerId: null, customerEmail: null, successUrl: "https://a.test/s", cancelUrl: "https://a.test/c", idempotencyKey: "second", clientReferenceId: "b2", metadata: {} });
    const second = stripe.completeCheckout(again.sessionId);
    await stripe.addOverageToSubscription(accountId, { subscriptionId: second.subscriptionId, meter: "voice", currency: "USD" });
    expect([...stripe.prices.values()].filter((candidate) => candidate.meterId !== undefined)).toEqual([{ ...price, active: true }]);
    expect(stripe.products.get(price.productId)).toMatchObject({ active: true });
    expect(stripe.subscriptions.get(second.subscriptionId)!.items.map((entry) => entry.priceId)).toContain(priceId);
  });

  it("signs deliveries only its own verifier accepts", () => {
    const stripe = new FakeStripeConnect();
    const { body, signature } = stripe.delivery("account.application.deauthorized", { accountId: "acct_1", eventId: "evt_1" });
    expect(stripe.verifyWebhook(body, signature)).toMatchObject({ id: "evt_1", accountId: "acct_1" });
    expect(() => stripe.verifyWebhook(body, "fake=0")).toThrow();
  });
});
