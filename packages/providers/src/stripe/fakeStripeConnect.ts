import { createHash, randomBytes } from "node:crypto";

import { eventSubscriptionId, type OnboardingLinkInput, type PackageCheckout, type PackageCheckoutInput, type PackagePrices, type PackageTerms, type StripeConnectAccount, type StripeConnectEvent, type StripeConnectProvider, type StripeConnectSubscription } from "./stripeConnect";

// A Stripe that lives in memory, for tests of everything behind the
// StripeConnectProvider interface. It keeps accounts, products, prices,
// checkouts and subscriptions per connected account, honours idempotency keys
// the way Stripe does, and signs webhook deliveries that only its own
// verifyWebhook accepts.

type FakeProduct = { accountId: string; name: string; active: boolean };
type FakePrice = { accountId: string; productId: string; currency: string; unitAmountMinor: number; recurring: boolean; active: boolean };
type FakeCheckout = PackageCheckout & { accountId: string; input: PackageCheckoutInput; status: "open" | "complete" | "expired"; subscriptionId: string | null };
type FakeSubscription = StripeConnectSubscription & { accountId: string };

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
