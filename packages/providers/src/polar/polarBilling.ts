import { assertCertificationBillingSandbox, assertCertificationRecipient } from "@lobbystack/shared";

export type PolarBillingConfig = {
  accessToken: string;
  organizationId: string;
  baseUrl?: string;
};

export class PolarBillingProvider {
  constructor(private readonly config: PolarBillingConfig) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    assertCertificationBillingSandbox(this.config.baseUrl ?? "https://api.polar.sh");
    const response = await fetch(`${this.config.baseUrl ?? "https://api.polar.sh"}${path}`, { ...init, signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${this.config.accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) } });
    if (!response.ok) {
      throw new Error(`Polar request failed with status ${response.status}.`);
    }
    return (await response.json()) as T;
  }

  async createCheckout(input: { productId: string; customerEmail: string; externalCustomerId: string; successUrl: string; returnUrl: string; idempotencyKey?: string }): Promise<{ checkoutUrl: string; checkoutId: string }> {
    assertCertificationRecipient("email", input.customerEmail);
    const result = await this.request<{ url: string; id: string }>(`/v1/checkouts/`, { method: "POST", ...(input.idempotencyKey ? { headers: { "idempotency-key": input.idempotencyKey } } : {}), body: JSON.stringify({ products: [input.productId], customer_email: input.customerEmail, external_customer_id: input.externalCustomerId, success_url: input.successUrl, return_url: input.returnUrl, customer_metadata: { externalCustomerId: input.externalCustomerId } }) });
    return { checkoutUrl: result.url, checkoutId: result.id };
  }

  async recordUsage(input: { eventName: string; externalCustomerId: string; quantity: number; timestamp: string; idempotencyKey: string; businessId: string; usageKind: string }): Promise<void> {
    await this.request("/v1/events/ingest", { method: "POST", body: JSON.stringify({ events: [{ name: input.eventName, external_customer_id: input.externalCustomerId, external_id: input.idempotencyKey, timestamp: input.timestamp, metadata: { quantity: input.quantity, businessId: input.businessId, usageKind: input.usageKind } }] }) });
  }

  async createCustomerPortalSession(input: { externalCustomerId: string; returnUrl: string }): Promise<{ url: string }> {
    const result = await this.request<{ customer_portal_url: string }>("/v1/customer-sessions/", { method: "POST", body: JSON.stringify({ external_customer_id: input.externalCustomerId, return_url: input.returnUrl }) });
    return { url: result.customer_portal_url };
  }

  /** Ends the subscription when its current period ends. Returns when that is. */
  async cancelSubscriptionAtPeriodEnd(input: { subscriptionId: string; reason?: PolarCancellationReason; comment?: string }): Promise<{ endsAt: string | null }> {
    const result = await this.request<{ ends_at?: string | null; current_period_end?: string | null }>(`/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`, { method: "PATCH", body: JSON.stringify({ cancel_at_period_end: true, ...(input.reason ? { customer_cancellation_reason: input.reason } : {}), ...(input.comment ? { customer_cancellation_comment: input.comment } : {}) }) });
    return { endsAt: result.ends_at ?? result.current_period_end ?? null };
  }
}

/** Polar's customer_cancellation_reason values. */
export type PolarCancellationReason = "customer_service" | "low_quality" | "missing_features" | "switched_service" | "too_complex" | "too_expensive" | "unused" | "other";
