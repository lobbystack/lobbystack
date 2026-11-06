import { assertCertificationBillingSandbox, assertCertificationRecipient } from "@lobbystack/shared";

export type PolarBillingConfig = {
  accessToken: string;
  organizationId: string;
  baseUrl?: string;
};

/** What Polar said went wrong, with no customer data and whether trying again may work. */
export class PolarRequestError extends Error {
  readonly status: number | null;
  readonly type: string | null;
  readonly detail: string | null;
  readonly transient: boolean;

  constructor(input: { status: number | null; type?: string | null; detail?: string | null; transient: boolean }) {
    const reason = [input.type, input.detail].filter(Boolean).join(": ") || null;
    const message = input.status === null
      ? `Polar request failed${reason ? ` (${reason})` : ""}.`
      : `Polar request failed with status ${input.status}${reason ? ` (${reason})` : ""}.`;
    super(message);
    this.name = "PolarRequestError";
    this.status = input.status;
    this.type = input.type ?? null;
    this.detail = input.detail ?? null;
    this.transient = input.transient;
  }
}

const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const prefixedIdPattern = /\b(cus|sub|evt|checkout|prod|org|price|mtr|meter|member)_[A-Za-z0-9]+\b/g;

/** Keeps an error message out of logs and the database when Polar echoes an address or an id. */
function redactPolarText(value: string): string {
  return value
    .replace(emailPattern, "[redacted-email]")
    .replace(uuidPattern, "[redacted-id]")
    .replace(prefixedIdPattern, (_match, prefix: string) => `${prefix}_[redacted]`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const messages = value.map((entry) => textValue(entry)).filter((entry): entry is string => Boolean(entry));
    return messages.length > 0 ? messages.join("; ") : null;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return textValue(record.message) ?? textValue(record.msg) ?? textValue(record.type);
  }
  return null;
}

async function readErrorBody(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    // A gateway's HTML or a plain sentence still says something, if briefly.
    return { detail: text };
  }
}

function errorFromStatus(status: number, body: Record<string, unknown> | null): PolarRequestError {
  const type = textValue(body?.error) ?? textValue(body?.type);
  const detail = textValue(body?.detail) ?? (type ? null : textValue(body?.message));
  return new PolarRequestError({
    status,
    type: type ? redactPolarText(type) : null,
    detail: detail ? redactPolarText(detail) : null,
    transient: status === 429 || status >= 500,
  });
}

export class PolarBillingProvider {
  constructor(private readonly config: PolarBillingConfig) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    assertCertificationBillingSandbox(this.config.baseUrl ?? "https://api.polar.sh");
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl ?? "https://api.polar.sh"}${path}`, { ...init, signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${this.config.accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) } });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new PolarRequestError({
        status: null,
        detail: timedOut ? "timed out" : redactPolarText(error instanceof Error ? error.message : "network error"),
        transient: true,
      });
    }
    if (!response.ok) throw errorFromStatus(response.status, await readErrorBody(response));
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

  // Polar's own customer ID, because an account migrated from Convex can carry a different external ID.
  async createCustomerPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    // Polar requires a member for team customers, which every account migrated from Convex is; the owner manages billing.
    const owners = await this.request<{ items: Array<{ id: string }> }>(`/v1/customers/${encodeURIComponent(input.customerId)}/members?role=owner&limit=1`);
    const memberId = owners.items[0]?.id;
    const result = await this.request<{ customer_portal_url: string }>("/v1/customer-sessions/", { method: "POST", body: JSON.stringify({ customer_id: input.customerId, ...(memberId ? { member_id: memberId } : {}), return_url: input.returnUrl }) });
    return { url: result.customer_portal_url };
  }

  /** Ends the subscription when its current period ends. Returns when that is. */
  async cancelSubscriptionAtPeriodEnd(input: { subscriptionId: string; reason?: PolarCancellationReason; comment?: string }): Promise<{ endsAt: string | null }> {
    const result = await this.request<{ ends_at?: string | null; current_period_end?: string | null }>(`/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`, { method: "PATCH", body: JSON.stringify({ cancel_at_period_end: true, ...(input.reason ? { customer_cancellation_reason: input.reason } : {}), ...(input.comment ? { customer_cancellation_comment: input.comment } : {}) }) });
    return { endsAt: result.ends_at ?? result.current_period_end ?? null };
  }

  /** Ends the subscription now, with no further charge. A subscription that already ended, or that Polar no longer has, counts as done. */
  async revokeSubscription(input: { subscriptionId: string }): Promise<void> {
    assertCertificationBillingSandbox(this.config.baseUrl ?? "https://api.polar.sh");
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl ?? "https://api.polar.sh"}/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`, { method: "DELETE", signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${this.config.accessToken}` } });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new PolarRequestError({
        status: null,
        detail: timedOut ? "timed out" : redactPolarText(error instanceof Error ? error.message : "network error"),
        transient: true,
      });
    }
    if (response.ok || response.status === 404) return;
    // Polar answers an ended subscription with 403, as it does a token that may not revoke, so only its own error type counts.
    const problem = await readErrorBody(response);
    if (response.status === 403 && problem?.error === "AlreadyCanceledSubscription") return;
    throw errorFromStatus(response.status, problem);
  }
}

/** Polar's customer_cancellation_reason values. */
export type PolarCancellationReason = "customer_service" | "low_quality" | "missing_features" | "switched_service" | "too_complex" | "too_expensive" | "unused" | "other";
