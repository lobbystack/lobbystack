import { isUuid, partnerTierForProduct, selfHostedSupportProduct } from "@lobbystack/shared";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * Translate signed Polar subscription/order payloads into our billing
 * vocabulary. A customer's reference names a business (business:<id>, or a
 * bare id) or a partner paying for its tier (partner:<id>).
 */
export function normalizePolarEvent(type: string, data: RecordValue, env: Record<string, string | undefined> = process.env) {
  const customer = record(data.customer);
  const customerMetadata = record(customer.metadata);
  const subscription = type.startsWith("subscription.") ? data : record(data.subscription);
  const externalId = text(customer.external_id) ?? text(data.external_customer_id) ?? text(data.externalCustomerId);
  // A Polar customer that predates the Postgres migration still carries the old
  // Convex id in `external_id`, while its metadata holds the current one. Take
  // whichever reference actually identifies a business rather than trusting
  // the first field that happens to be populated.
  const raw = [
    text(data.businessId),
    text(customer.external_id),
    text(data.external_customer_id),
    text(data.externalCustomerId),
    text(customerMetadata.externalCustomerId),
    text(customerMetadata.businessId),
  ].flatMap(value => value ? [value] : []);
  const references = raw.map(value => value.match(/^business:(.+)$/)?.[1] ?? value);
  const businessIndex = references.findIndex(isUuid);
  const partnerIndex = raw.findIndex(value => isUuid(value.match(/^partner:(.+)$/)?.[1]));
  // A partner's customer never names a business, so the partner wins only when it comes first.
  const partnerId = partnerIndex >= 0 && (businessIndex < 0 || partnerIndex < businessIndex) ? raw[partnerIndex]!.slice("partner:".length) : undefined;
  const businessId = partnerId ? undefined : references[businessIndex];
  const candidate = businessId ?? references[0];
  // Only a subscription sets the plan; a checkout or one-off order with a product_id must not.
  const productId = text(subscription.product_id);
  const directPlan = (["starter", "pro"] as const).flatMap(plan => (["monthly", "annual"] as const).map(interval => ({ plan, interval, id: env[`POLAR_${plan.toUpperCase()}_${interval.toUpperCase()}_PRODUCT_ID`] }))).find(product => product.id && product.id === productId);
  const match = partnerId ? undefined : directPlan;
  // A partner's subscription sells a tier, never a plan.
  const tier = partnerId ? partnerTierForProduct(env, productId) : null;
  // A product from the other catalog sells this customer nothing: a partner whose tier's
  // subscription moves to a business's plan in Polar's portal, or a business whose plan's moves
  // to a partner's tier. Reconcile ends what the subscription sold instead of keeping it. A
  // product no catalog names, such as a retired one, still keeps it.
  const foreignProduct = productId !== undefined && (partnerId ? directPlan !== undefined : partnerTierForProduct(env, productId) !== null);
  // A self-hosted support product sells no plan or tier, but a hosted customer can buy one, and can
  // even switch its plan's subscription to one in the portal. Reconcile reads the flag to decide.
  const supportPlan = [productId, text(data.product_id), text(record(data.product).id)].map(selfHostedSupportProduct).find(plan => plan !== null) ?? null;
  const subscriptionId = text(subscription.id) ?? text(data.subscription_id);
  const customerId = text(customer.id) ?? text(data.customer_id);
  const subscriptionState = text(subscription.status);
  // Reconcile orders subscription snapshots by this, so a late retry cannot roll state back.
  const modifiedAt = new Date(text(subscription.modified_at) ?? text(subscription.created_at) ?? Number.NaN);
  const subscriptionModifiedAt = Number.isNaN(modifiedAt.valueOf()) ? undefined : modifiedAt.toISOString();
  return {
    businessId,
    businessReference: partnerId ? undefined : candidate,
    partnerId,
    supportPlan,
    payload: {
      ...data,
      ...(externalId ? { billingKey: externalId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(subscriptionId ? { subscriptionId } : {}),
      ...(match ? { plan: match.plan, billingInterval: match.interval } : {}),
      ...(tier ? { partnerTier: tier.tier, billingInterval: tier.billingInterval } : {}),
      ...(subscriptionState ? { subscriptionState } : {}),
      ...(subscriptionModifiedAt ? { subscriptionModifiedAt } : {}),
      ...(supportPlan ? { selfHostedSupport: true } : {}),
      ...(foreignProduct ? { foreignProduct: true } : {}),
    },
  };
}

