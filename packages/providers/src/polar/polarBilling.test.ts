import { afterEach, describe, expect, it, vi } from "vitest";

import { PolarBillingProvider } from "./polarBilling";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PolarBillingProvider", () => {
  it("ingests named usage events with a stable external ID and no meter-ID configuration", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ inserted: 1, duplicates: 0 }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new PolarBillingProvider({ accessToken: "token", organizationId: "organization", baseUrl: "https://polar.example" });
    await provider.recordUsage({ eventName: "billing.voice_minutes", externalCustomerId: "business:1", quantity: 1.5, timestamp: "2026-09-08T00:00:00.000Z", idempotencyKey: "voice:call-1", businessId: "1", usageKind: "voice_seconds" });
    expect(fetchMock).toHaveBeenCalledWith("https://polar.example/v1/events/ingest", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toEqual({ events: [{ name: "billing.voice_minutes", external_customer_id: "business:1", external_id: "voice:call-1", timestamp: "2026-09-08T00:00:00.000Z", metadata: { quantity: 1.5, businessId: "1", usageKind: "voice_seconds" } }] });
  });
  it("opens the customer portal as the customer's owner member, which Polar requires for team customers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: "member-1" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ customer_portal_url: "https://polar.example/portal" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new PolarBillingProvider({ accessToken: "token", organizationId: "organization", baseUrl: "https://polar.example" });
    await expect(provider.createCustomerPortalSession({ customerId: "customer-1", returnUrl: "https://app.example/settings/plan" })).resolves.toEqual({ url: "https://polar.example/portal" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://polar.example/v1/customers/customer-1/members?role=owner&limit=1");
    expect(fetchMock).toHaveBeenLastCalledWith("https://polar.example/v1/customer-sessions/", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({ customer_id: "customer-1", member_id: "member-1", return_url: "https://app.example/settings/plan" });
  });
  it("lets Polar pick the member when the customer lists no owner", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ customer_portal_url: "https://polar.example/portal" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new PolarBillingProvider({ accessToken: "token", organizationId: "organization", baseUrl: "https://polar.example" });
    await provider.createCustomerPortalSession({ customerId: "customer-1", returnUrl: "https://app.example/settings/plan" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({ customer_id: "customer-1", return_url: "https://app.example/settings/plan" });
  });
  it("creates a checkout with the current Polar product-session payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "checkout-1", url: "https://polar.example/checkout-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new PolarBillingProvider({ accessToken: "token", organizationId: "organization", baseUrl: "https://polar.example" });

    await expect(provider.createCheckout({ productId: "product-1", customerEmail: "owner@example.com", externalCustomerId: "business:1", successUrl: "https://app.example/settings/plan?checkout=success", returnUrl: "https://app.example/settings/plan", idempotencyKey: "billing-checkout:request-1" })).resolves.toEqual({ checkoutId: "checkout-1", checkoutUrl: "https://polar.example/checkout-1" });

    expect(fetchMock).toHaveBeenCalledWith("https://polar.example/v1/checkouts/", expect.objectContaining({ method: "POST" }));
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("idempotency-key")).toBe("billing-checkout:request-1");
    expect(JSON.parse(String(request.body))).toEqual({ products: ["product-1"], customer_email: "owner@example.com", external_customer_id: "business:1", success_url: "https://app.example/settings/plan?checkout=success", return_url: "https://app.example/settings/plan", customer_metadata: { externalCustomerId: "business:1" } });
  });
  it("cancels a subscription at the end of its period with the customer's reason and comment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "sub/1", cancel_at_period_end: true, ends_at: "2026-11-12T00:00:00Z", current_period_end: "2026-11-12T00:00:00Z" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new PolarBillingProvider({ accessToken: "token", organizationId: "organization", baseUrl: "https://polar.example" });

    await expect(provider.cancelSubscriptionAtPeriodEnd({ subscriptionId: "sub/1", reason: "too_expensive", comment: "Too much for one clinic" })).resolves.toEqual({ endsAt: "2026-11-12T00:00:00Z" });

    expect(fetchMock).toHaveBeenCalledWith("https://polar.example/v1/subscriptions/sub%2F1", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toEqual({ cancel_at_period_end: true, customer_cancellation_reason: "too_expensive", customer_cancellation_comment: "Too much for one clinic" });
  });
  it("cancels without a reason and falls back to the period end", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ends_at: null, current_period_end: "2026-11-12T00:00:00Z" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new PolarBillingProvider({ accessToken: "token", organizationId: "organization", baseUrl: "https://polar.example" });

    await expect(provider.cancelSubscriptionAtPeriodEnd({ subscriptionId: "sub-1" })).resolves.toEqual({ endsAt: "2026-11-12T00:00:00Z" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toEqual({ cancel_at_period_end: true });
  });
  describe("revokeSubscription", () => {
    const provider = () => new PolarBillingProvider({ accessToken: "token", organizationId: "organization", baseUrl: "https://polar.example" });
    const answer = (status: number, body: unknown = {}) => vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

    it("ends the subscription now", async () => {
      const fetchMock = answer(200);
      vi.stubGlobal("fetch", fetchMock);
      await provider().revokeSubscription({ subscriptionId: "sub 1" });
      expect(fetchMock).toHaveBeenCalledWith("https://polar.example/v1/subscriptions/sub%201", expect.objectContaining({ method: "DELETE" }));
    });
    it("counts a subscription Polar no longer has, or that already ended, as done", async () => {
      vi.stubGlobal("fetch", answer(404));
      await expect(provider().revokeSubscription({ subscriptionId: "sub_1" })).resolves.toBeUndefined();
      vi.stubGlobal("fetch", answer(403, { error: "AlreadyCanceledSubscription" }));
      await expect(provider().revokeSubscription({ subscriptionId: "sub_1" })).resolves.toBeUndefined();
    });
    it("fails for anything else, so a token that may not revoke never passes for an ended plan", async () => {
      vi.stubGlobal("fetch", answer(403, { error: "NotPermitted" }));
      await expect(provider().revokeSubscription({ subscriptionId: "sub_1" })).rejects.toThrow("status 403");
      vi.stubGlobal("fetch", answer(500));
      await expect(provider().revokeSubscription({ subscriptionId: "sub_1" })).rejects.toThrow("status 500");
    });
  });
});
