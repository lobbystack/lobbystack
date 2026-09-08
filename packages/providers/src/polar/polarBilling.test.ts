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
    expect(fetchMock).toHaveBeenCalledWith("https://polar.example/v1/events/ingest", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toEqual({ events: [{ name: "billing.voice_minutes", external_customer_id: "business:1", external_id: "voice:call-1", timestamp: "2026-09-08T00:00:00.000Z", metadata: { quantity: 1.5, businessId: "1", usageKind: "voice_seconds" } }] });
  });
  it("creates a checkout with the current Polar product-session payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "checkout-1", url: "https://polar.example/checkout-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new PolarBillingProvider({ accessToken: "token", organizationId: "organization", baseUrl: "https://polar.example" });

    await expect(provider.createCheckout({ productId: "product-1", customerEmail: "owner@example.com", externalCustomerId: "business:1", successUrl: "https://app.example/settings/plan", idempotencyKey: "billing-checkout:request-1" })).resolves.toEqual({ checkoutId: "checkout-1", checkoutUrl: "https://polar.example/checkout-1" });

    expect(fetchMock).toHaveBeenCalledWith("https://polar.example/v1/checkouts/", expect.objectContaining({ method: "POST" }));
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("idempotency-key")).toBe("billing-checkout:request-1");
    expect(JSON.parse(String(request.body))).toEqual({ products: ["product-1"], customer_email: "owner@example.com", external_customer_id: "business:1", success_url: "https://app.example/settings/plan", return_url: "https://app.example/settings/plan", customer_metadata: { externalCustomerId: "business:1" } });
  });
});
