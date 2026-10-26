import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeStripeConnect } from "./fakeStripeConnect";
import { createStripeConnectProvider, StripeConnectAdapter, stripeUnitAmount } from "./stripeConnect";

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

  it("signs deliveries only its own verifier accepts", () => {
    const stripe = new FakeStripeConnect();
    const { body, signature } = stripe.delivery("account.application.deauthorized", { accountId: "acct_1", eventId: "evt_1" });
    expect(stripe.verifyWebhook(body, signature)).toMatchObject({ id: "evt_1", accountId: "acct_1" });
    expect(() => stripe.verifyWebhook(body, "fake=0")).toThrow();
  });
});
