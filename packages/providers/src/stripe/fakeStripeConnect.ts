import { createHash, randomBytes } from "node:crypto";

import { currencyFractionDigits } from "@lobbystack/shared";

import { eventSubscriptionId, OVERAGE_METERS, overageMeterValue, overagePriceLookupKey, overageUnitAmount, type OnboardingLinkInput, type OverageMeter, type OverageReport, type PackageCheckout, type PackageCheckoutInput, type PackagePrices, type PackageTerms, type StripeConnectAccount, type StripeConnectEvent, type StripeConnectProvider, type StripeConnectSubscription } from "./stripeConnect";

// A Stripe that lives in memory, for tests of everything behind the
// StripeConnectProvider interface. It keeps accounts, products, prices,
// checkouts, subscriptions, meters and their events per connected account,
// honours idempotency keys and meter event identifiers the way Stripe does,
// and signs webhook deliveries that only its own verifyWebhook accepts.

type FakeProduct = { accountId: string; name: string; active: boolean };
type FakePrice = { accountId: string; productId: string; currency: string; unitAmountMinor: number; recurring: boolean; active: boolean; meterId?: string; lookupKey?: string };
type FakeCheckout = PackageCheckout & { accountId: string; input: PackageCheckoutInput; status: "open" | "complete" | "expired"; subscriptionId: string | null };
type FakeSubscription = StripeConnectSubscription & { accountId: string; currency: string; items: Array<{ id: string; priceId: string }> };
type FakeMeter = { accountId: string; eventName: string; active: boolean };
/** A meter event as Stripe counted it, with its value as the adapter would send it. */
type FakeMeterEvent = { accountId: string; eventName: string; identifier: string; customerId: string; value: string };

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function signatureFor(body: string): string {
  return `fake=${createHash("sha256").update(body).digest("hex")}`;
}

export class FakeStripeConnect implements StripeConnectProvider {
  readonly accounts = new Map<string, StripeConnectAccount>();
  readonly products = new Map<string, FakeProduct>();
  readonly prices = new Map<string, FakePrice>();
  readonly checkouts = new Map<string, FakeCheckout>();
  readonly subscriptions = new Map<string, FakeSubscription>();
  readonly meters = new Map<string, FakeMeter>();
  /** Every meter event Stripe counted, in order. A second one under the same identifier on an account isn't counted. */
  readonly meterEvents: FakeMeterEvent[] = [];
  /** Every onboarding link asked for, in order. */
  readonly onboardingLinks: OnboardingLinkInput[] = [];
  /** Every customer portal link asked for, in order. */
  readonly portals: Array<{ accountId: string; customerId: string; returnUrl: string }> = [];
  private readonly idempotent = new Map<string, string>();
  private failure: Error | null = null;

  /** Makes the next call throw, as Stripe does when it's down or refuses a request. */
  failNextCall(error: Error = Object.assign(new Error("Stripe is unavailable."), { type: "StripeConnectionError" })): void {
    this.failure = error;
  }

  private takeFailure(): void {
    const failure = this.failure;
    this.failure = null;
    if (failure) throw failure;
  }

  /** Changes what Stripe says of an account, as onboarding or a review would. */
  updateAccount(accountId: string, change: Partial<Omit<StripeConnectAccount, "accountId">>): StripeConnectAccount {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`No such account: ${accountId}`);
    const updated = { ...account, ...change };
    this.accounts.set(accountId, updated);
    return updated;
  }

  async createOnboardingLink(input: OnboardingLinkInput): Promise<{ accountId: string; url: string }> {
    this.takeFailure();
    this.onboardingLinks.push(input);
    let accountId = input.accountId;
    if (accountId && !this.accounts.has(accountId)) throw Object.assign(new Error(`No such account: ${accountId}`), { statusCode: 404 });
    if (!accountId) {
      if (!input.country) throw Object.assign(new Error("Choose the country your business is in."), { status: 400, code: "invalid_country" });
      accountId = this.idempotent.get(input.idempotencyKey) ?? id("acct");
      this.idempotent.set(input.idempotencyKey, accountId);
      if (!this.accounts.has(accountId)) {
        this.accounts.set(accountId, { accountId, country: input.country, currency: input.country === "US" ? "USD" : null, detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, disabledReason: "requirements.past_due" });
      }
    }
    return { accountId, url: `https://connect.stripe.test/setup/${accountId}?return=${encodeURIComponent(input.returnUrl)}` };
  }

  async retrieveAccount(accountId: string): Promise<StripeConnectAccount> {
    this.takeFailure();
    const account = this.accounts.get(accountId);
    if (!account) throw Object.assign(new Error(`No such account: ${accountId}`), { statusCode: 404 });
    return { ...account };
  }

  async upsertPackagePrice(accountId: string, terms: PackageTerms): Promise<PackagePrices> {
    this.takeFailure();
    if (!this.accounts.has(accountId)) throw Object.assign(new Error(`No such account: ${accountId}`), { statusCode: 404 });
    if (terms.prices) {
      const product = this.products.get(terms.prices.productId);
      if (!product || product.accountId !== accountId) throw Object.assign(new Error(`No such product: ${terms.prices.productId}`), { statusCode: 404 });
      this.products.set(terms.prices.productId, { ...product, name: terms.name, active: terms.active });
      if (!terms.active) {
        for (const priceId of [terms.prices.priceId, terms.prices.setupPriceId]) {
          const price = priceId ? this.prices.get(priceId) : undefined;
          if (priceId && price) this.prices.set(priceId, { ...price, active: false });
        }
      }
      return terms.prices;
    }
    const productId = this.idempotent.get(`package:${terms.packageId}:product`) ?? id("prod");
    this.idempotent.set(`package:${terms.packageId}:product`, productId);
    this.products.set(productId, { accountId, name: terms.name, active: terms.active });
    const price = (key: string, unitAmountMinor: number, recurring: boolean) => {
      const priceId = this.idempotent.get(key) ?? id("price");
      this.idempotent.set(key, priceId);
      this.prices.set(priceId, { accountId, productId, currency: terms.currency, unitAmountMinor, recurring, active: true });
      return priceId;
    };
    return {
      productId,
      priceId: price(`package:${terms.packageId}:monthly`, terms.monthlyPriceMinor, true),
      setupPriceId: terms.setupFeeMinor === null ? null : price(`package:${terms.packageId}:setup`, terms.setupFeeMinor, false),
    };
  }

  async createCheckout(accountId: string, input: PackageCheckoutInput): Promise<PackageCheckout> {
    this.takeFailure();
    if (!this.accounts.has(accountId)) throw Object.assign(new Error(`No such account: ${accountId}`), { statusCode: 404 });
    for (const priceId of [input.priceId, input.setupPriceId]) {
      const price = priceId ? this.prices.get(priceId) : undefined;
      if (priceId && (!price || price.accountId !== accountId || !price.active)) throw Object.assign(new Error(`No such price: ${priceId}`), { statusCode: 400 });
    }
    const existing = this.idempotent.get(`checkout:${input.idempotencyKey}`);
    if (existing) return this.checkoutOf(existing);
    const sessionId = id("cs_test");
    this.idempotent.set(`checkout:${input.idempotencyKey}`, sessionId);
    const checkout: FakeCheckout = { sessionId, url: `https://checkout.stripe.test/c/pay/${sessionId}`, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), accountId, input, status: "open", subscriptionId: null };
    this.checkouts.set(sessionId, checkout);
    return this.checkoutOf(sessionId);
  }

  private checkoutOf(sessionId: string): PackageCheckout {
    const { url, expiresAt } = this.checkouts.get(sessionId)!;
    return { sessionId, url, expiresAt };
  }

  async expireCheckout(accountId: string, sessionId: string): Promise<void> {
    this.takeFailure();
    const checkout = this.checkouts.get(sessionId);
    if (!checkout || checkout.accountId !== accountId) throw Object.assign(new Error(`No such checkout.session: ${sessionId}`), { statusCode: 404 });
    if (checkout.status !== "open") throw Object.assign(new Error("Only Checkout Sessions with a status in [\"open\"] can be expired."), { statusCode: 400 });
    this.checkouts.set(sessionId, { ...checkout, status: "expired" });
  }

  async createPortal(accountId: string, customerId: string, returnUrl: string): Promise<{ url: string }> {
    this.takeFailure();
    if (![...this.subscriptions.values()].some((subscription) => subscription.accountId === accountId && subscription.customerId === customerId)) throw Object.assign(new Error(`No such customer: ${customerId}`), { statusCode: 404 });
    this.portals.push({ accountId, customerId, returnUrl });
    return { url: `https://billing.stripe.test/p/session/${customerId}` };
  }

  async retrieveSubscription(accountId: string, subscriptionId: string): Promise<StripeConnectSubscription> {
    this.takeFailure();
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription || subscription.accountId !== accountId) throw Object.assign(new Error(`No such subscription: ${subscriptionId}`), { statusCode: 404 });
    return { subscriptionId, customerId: subscription.customerId, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd, metadata: { ...subscription.metadata } };
  }

  async cancelSubscription(accountId: string, subscriptionId: string): Promise<StripeConnectSubscription> {
    this.takeFailure();
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription || subscription.accountId !== accountId) throw Object.assign(new Error(`No such subscription: ${subscriptionId}`), { statusCode: 404 });
    const ended = subscription.status === "canceled" || subscription.status === "incomplete_expired" ? subscription : this.updateSubscription(subscriptionId, { status: "canceled" });
    return { subscriptionId, customerId: ended.customerId, status: ended.status, currentPeriodEnd: ended.currentPeriodEnd, metadata: { ...ended.metadata } };
  }

  async addOverageToSubscription(accountId: string, input: { subscriptionId: string; meter: OverageMeter; currency: string }): Promise<{ subscriptionItemId: string }> {
    this.takeFailure();
    const subscription = this.subscriptions.get(input.subscriptionId);
    if (!subscription || subscription.accountId !== accountId) throw Object.assign(new Error(`No such subscription: ${input.subscriptionId}`), { statusCode: 404 });
    if (subscription.currency !== input.currency) throw Object.assign(new Error(`The subscription is in ${subscription.currency}, not ${input.currency}.`), { status: 409, code: "currency_mismatch" });
    const { eventName, productName } = OVERAGE_METERS[input.meter];
    let meterId = [...this.meters].find(([, meter]) => meter.accountId === accountId && meter.eventName === eventName)?.[0];
    if (!meterId) meterId = id("mtr");
    // A meter the partner deactivated counts again.
    this.meters.set(meterId, { accountId, eventName, active: true });
    const existing = subscription.items.find((item) => this.prices.get(item.priceId)?.meterId === meterId);
    if (existing) return { subscriptionItemId: existing.id };
    const lookupKey = overagePriceLookupKey(input.meter, input.currency);
    // A lookup key names one price, archived or not, and a price the partner archived goes back on sale with its product.
    let priceId = [...this.prices].find(([, price]) => price.accountId === accountId && price.lookupKey === lookupKey)?.[0];
    const found = priceId ? this.prices.get(priceId) : undefined;
    if (priceId && found) {
      this.prices.set(priceId, { ...found, active: true });
      const product = this.products.get(found.productId);
      if (product) this.products.set(found.productId, { ...product, active: true });
    }
    if (!priceId) {
      const productId = id("prod");
      this.products.set(productId, { accountId, name: productName, active: true });
      priceId = id("price");
      this.prices.set(priceId, { accountId, productId, currency: input.currency, unitAmountMinor: overageUnitAmount(input.currency), recurring: true, active: true, meterId, lookupKey });
    }
    const item = { id: id("si"), priceId };
    this.subscriptions.set(input.subscriptionId, { ...subscription, items: [...subscription.items, item] });
    return { subscriptionItemId: item.id };
  }

  async reportOverage(accountId: string, report: OverageReport): Promise<void> {
    this.takeFailure();
    const { eventName } = OVERAGE_METERS[report.meter];
    if (![...this.meters.values()].some((meter) => meter.accountId === accountId && meter.eventName === eventName)) throw Object.assign(new Error(`No meter for ${eventName}.`), { statusCode: 400 });
    if (this.meterEvents.some((event) => event.accountId === accountId && event.identifier === report.identifier)) return;
    this.meterEvents.push({ accountId, eventName, identifier: report.identifier, customerId: report.customerId, value: overageMeterValue(report.amountMinor, report.currency) });
  }

  /**
   * What a customer's next invoice charges for a kind of overage, in the
   * smallest unit of its currency: what its meter counted, at one major unit
   * each, as Stripe's invoice rounds it. Zero without a subscription item on
   * the meter, since nothing would bill it.
   */
  overageBilled(accountId: string, customerId: string, meter: OverageMeter): number {
    const { eventName } = OVERAGE_METERS[meter];
    const subscription = [...this.subscriptions.values()].find((candidate) => candidate.accountId === accountId && candidate.customerId === customerId && candidate.items.some((item) => {
      const meterId = this.prices.get(item.priceId)?.meterId;
      return meterId !== undefined && this.meters.get(meterId)?.eventName === eventName;
    }));
    if (!subscription) return 0;
    const digits = currencyFractionDigits(subscription.currency);
    const counted = this.meterEvents.filter((event) => event.accountId === accountId && event.customerId === customerId && event.eventName === eventName).reduce((sum, event) => sum + Number(event.value), 0);
    return Math.round(counted * 10 ** digits);
  }

  /**
   * Pays an open checkout, as the business would: Stripe makes the customer,
   * unless the checkout named one, and the subscription, which carries the
   * checkout's metadata.
   */
  completeCheckout(sessionId: string, options: { status?: string } = {}): FakeSubscription {
    const checkout = this.checkouts.get(sessionId);
    if (!checkout || checkout.status !== "open") throw new Error(`No open checkout: ${sessionId}`);
    const subscriptionId = id("sub");
    const subscription: FakeSubscription = {
      accountId: checkout.accountId,
      currency: this.prices.get(checkout.input.priceId)?.currency ?? "USD",
      items: [{ id: id("si"), priceId: checkout.input.priceId }],
      subscriptionId,
      customerId: checkout.input.customerId ?? id("cus"),
      status: options.status ?? "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      metadata: { ...checkout.input.metadata },
    };
    this.subscriptions.set(subscriptionId, subscription);
    this.checkouts.set(sessionId, { ...checkout, status: "complete", subscriptionId });
    return subscription;
  }

  /** Changes what Stripe says of a subscription, as a failed payment or a cancellation would. */
  updateSubscription(subscriptionId: string, change: Partial<Omit<StripeConnectSubscription, "subscriptionId">>): FakeSubscription {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error(`No such subscription: ${subscriptionId}`);
    const updated = { ...subscription, ...change };
    this.subscriptions.set(subscriptionId, updated);
    return updated;
  }

  /** The object a checkout event carries, as Stripe sends it. */
  checkoutObject(sessionId: string): Record<string, unknown> {
    const checkout = this.checkouts.get(sessionId);
    if (!checkout) throw new Error(`No such checkout: ${sessionId}`);
    const subscription = checkout.subscriptionId ? this.subscriptions.get(checkout.subscriptionId) : undefined;
    return { id: sessionId, object: "checkout.session", mode: "subscription", status: checkout.status, client_reference_id: checkout.input.clientReferenceId, customer: subscription?.customerId ?? checkout.input.customerId, subscription: checkout.subscriptionId, metadata: { ...checkout.input.metadata } };
  }

  /** The object a subscription event carries, as Stripe sends it. Its status may be older than the subscription's now. */
  subscriptionObject(subscriptionId: string, change: { status?: string } = {}): Record<string, unknown> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error(`No such subscription: ${subscriptionId}`);
    return { id: subscriptionId, object: "subscription", status: change.status ?? subscription.status, customer: subscription.customerId, metadata: { ...subscription.metadata } };
  }

  /** A delivery of an event on a connected account, signed the way verifyWebhook expects. */
  delivery(type: string, input: { accountId: string; eventId?: string; createdAt?: Date; object?: Record<string, unknown> }): { body: string; signature: string } {
    const account = type === "account.updated" ? this.accounts.get(input.accountId) ?? null : null;
    const body = JSON.stringify({
      id: input.eventId ?? id("evt"),
      type,
      created: Math.floor((input.createdAt ?? new Date()).getTime() / 1000),
      account: input.accountId,
      data: { object: input.object ?? (account ? { ...account } : { id: input.accountId }) },
    });
    return { body, signature: signatureFor(body) };
  }

  verifyWebhook(body: string, signature: string): StripeConnectEvent {
    if (signature !== signatureFor(body)) throw Object.assign(new Error("No signatures found matching the expected signature for payload."), { type: "StripeSignatureVerificationError" });
    const event = JSON.parse(body) as { id: string; type: string; created: number; account: string | null; data: { object: Record<string, unknown> } };
    return {
      id: event.id,
      type: event.type,
      createdAt: new Date(event.created * 1000),
      accountId: event.account,
      account: event.type === "account.updated" ? event.data.object as unknown as StripeConnectAccount : null,
      subscriptionId: eventSubscriptionId(event.type, event.data.object),
      object: event.data.object,
    };
  }
}
