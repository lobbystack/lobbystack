type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;

/** Translate signed Polar subscription/order payloads into our billing vocabulary. */
export function normalizePolarEvent(type: string, data: RecordValue, env: Record<string, string | undefined> = process.env) {
  const customer = record(data.customer);
  const subscription = type.startsWith("subscription.") ? data : record(data.subscription);
  const externalId = text(customer.external_id) ?? text(data.external_customer_id) ?? text(data.externalCustomerId);
  const candidate = text(data.businessId) ?? externalId?.match(/^business:(.+)$/)?.[1];
  const businessId = candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate) ? candidate : undefined;
  const productId = text(subscription.product_id) ?? text(data.product_id);
  const match = (["starter", "pro"] as const).flatMap(plan => (["monthly", "annual"] as const).map(interval => ({ plan, interval, id: env[`POLAR_${plan.toUpperCase()}_${interval.toUpperCase()}_PRODUCT_ID`] }))).find(product => product.id && product.id === productId);
  const subscriptionId = text(subscription.id) ?? text(data.subscription_id);
  const customerId = text(customer.id) ?? text(data.customer_id);
  const subscriptionState = text(subscription.status);
  return {
    businessId,
    payload: {
      ...data,
      ...(externalId ? { billingKey: externalId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(subscriptionId ? { subscriptionId } : {}),
      ...(match ? { plan: match.plan, billingInterval: match.interval } : {}),
      ...(subscriptionState ? { subscriptionState } : {}),
    },
  };
}
