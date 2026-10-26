import Stripe from "stripe";

import { currencyFractionDigits, isCertificationMode, partnerFeatures } from "@lobbystack/shared";

// Stripe Connect for partners (ADR 0009). Each partner connects its own
// Stripe account, and everything it sells is created on that account: the
// products and prices of its packages, its businesses' checkouts and
// subscriptions, and their customer portal. Every call that acts for a partner sends its
// account in the Stripe-Account header, so they are direct charges and the
// host never holds a business's money.

/** What the deployment keeps of a partner's connected account. */
export type StripeConnectAccount = {
  accountId: string;
  /** ISO 3166-1 alpha-2, uppercase. */
  country: string | null;
  /** ISO 4217, uppercase: the currency the partner's packages are priced in. */
  currency: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** Why Stripe doesn't let the account take payments, such as requirements.past_due. */
  disabledReason: string | null;
};

/** A package's prices on the partner's account. */
export type PackagePrices = { productId: string; priceId: string; setupPriceId: string | null };

/** A package as Stripe sells it. Amounts are in the currency's smallest unit, as LobbyStack stores them. */
export type PackageTerms = {
  packageId: string;
  name: string;
  /** ISO 4217, uppercase. */
  currency: string;
  monthlyPriceMinor: number;
  setupFeeMinor: number | null;
  /** Whether new checkouts can sell it. Subscriptions already on it carry on either way. */
  active: boolean;
  /** Its prices when they already exist on the account, or null to create them. */
  prices: PackagePrices | null;
};

/** A verified event from the Connect webhook. */
export type StripeConnectEvent = {
  id: string;
  type: string;
  /** When Stripe created the event, which orders events that describe the same account. */
  createdAt: Date;
  /** The connected account the event happened on. */
  accountId: string | null;
  /** The account as the event describes it, on account.updated. */
  account: StripeConnectAccount | null;
  /** The subscription the event is about: its own, the one a checkout started, or the one an invoice bills. */
  subscriptionId: string | null;
  /** The event's object, for the events other modules reconcile. */
  object: Record<string, unknown>;
};

/** A business's subscription to a package, as Stripe describes it now. */
export type StripeConnectSubscription = {
  subscriptionId: string;
  customerId: string;
  /** Stripe's status: active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired or paused. */
  status: string;
  /** When the period the business last paid for ends, or null when Stripe names none. */
  currentPeriodEnd: Date | null;
  /** What the checkout that started it set, which names the business. */
  metadata: Record<string, string>;
};

/** A checkout for one business's package, on the partner's account. */
export type PackageCheckoutInput = {
  /** The package's monthly price, and its one-time setup fee price, which the first invoice charges with the first month. */
  priceId: string;
  setupPriceId: string | null;
  /** The business's customer from an earlier subscription, so its portal keeps every invoice; or null for Checkout to make one. */
  customerId: string | null;
  /** Fills the payer's email when there's no customer yet. */
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Makes creating the checkout safe to repeat: the same key gets the same checkout for 24 hours. */
  idempotencyKey: string;
  /** The business the checkout sells to. */
  clientReferenceId: string;
  /** Kept on the checkout and on the subscription it starts, so the webhook knows the business. */
  metadata: Record<string, string>;
};

export type PackageCheckout = { sessionId: string; url: string; expiresAt: Date };

export type OnboardingLinkInput = {
  /** The partner's account, or null to create one. */
  accountId: string | null;
  /** The country a new account opens in. Stripe fixes it when it creates the account. */
  country: string | null;
  /** Makes creating an account safe to repeat: the same key gets the same account for 24 hours. */
  idempotencyKey: string;
  /** Where Stripe sends the partner when it finishes or leaves onboarding. */
  returnUrl: string;
  /** Where Stripe sends the partner when the link expired or was used, to get a new one. */
  refreshUrl: string;
  metadata: Record<string, string>;
};

/** The kinds of overage a business pays its partner for, each on its own meter, so its invoices show calls and chats apart. */
export type OverageMeter = "voice" | "chat";

/** One report of a business's overage to its partner's account. */
export type OverageReport = {
  /** Names the report on the account, so Stripe charges it once however often it's sent. */
  identifier: string;
  /** The business's customer on the partner's account. */
  customerId: string;
  meter: OverageMeter;
  /** What the overage costs, in the smallest unit of `currency`, as LobbyStack stores amounts, fractions included. Below 0 when a correction lowered it. */
  amountMinor: number;
  /** ISO 4217, uppercase: the currency of the business's subscription. */
  currency: string;
};

/** Everything the deployment asks of Stripe for partners, so tests can pass a fake. */
export interface StripeConnectProvider {
  /** A link to Stripe's hosted onboarding for the partner's account, creating the account first when it has none. */
  createOnboardingLink(input: OnboardingLinkInput): Promise<{ accountId: string; url: string }>;
  /** The account as Stripe describes it now. */
  retrieveAccount(accountId: string): Promise<StripeConnectAccount>;
  /** Creates a package's product and prices on the account, or updates its name and whether it's for sale. */
  upsertPackagePrice(accountId: string, terms: PackageTerms): Promise<PackagePrices>;
  /** A hosted checkout on the account that subscribes a business to a package. */
  createCheckout(accountId: string, input: PackageCheckoutInput): Promise<PackageCheckout>;
  /** Closes a checkout nobody paid yet, so it can't start a second subscription. */
  expireCheckout(accountId: string, sessionId: string): Promise<void>;
  /** A link to the account's customer portal for one of its customers, where they update their card and download invoices. */
  createPortal(accountId: string, customerId: string, returnUrl: string): Promise<{ url: string }>;
  /** The subscription as Stripe describes it now. */
  retrieveSubscription(accountId: string, subscriptionId: string): Promise<StripeConnectSubscription>;
  /** Ends a subscription now, so its customer pays nothing more, and returns it as it ended. One that already ended stays as it is. */
  cancelSubscription(accountId: string, subscriptionId: string): Promise<StripeConnectSubscription>;
  /**
   * Makes a subscription bill one kind of overage: the account's meter for it
   * and the meter's price in the subscription's currency, made the first time
   * any business of the partner needs them, and an item for that price on the
   * subscription. Returns the item, which an earlier call may have added.
   */
  addOverageToSubscription(accountId: string, input: { subscriptionId: string; meter: OverageMeter; currency: string }): Promise<{ subscriptionItemId: string }>;
  /** Sends a report of overage to its meter, which adds it to the customer's next invoice. A report already sent under its identifier changes nothing. */
  reportOverage(accountId: string, report: OverageReport): Promise<void>;
  /** The event a Connect webhook delivery carries, or a thrown error when its signature doesn't check out. */
  verifyWebhook(body: string, signature: string): StripeConnectEvent;
}

export type StripeConnectConfig = {
  /** A secret key (sk_...) or a restricted key (rk_...) of the host's Stripe platform account. */
  secretKey: string;
  /** The signing secret (whsec_...) of the webhook endpoint that listens to connected accounts. */
  webhookSecret: string;
  /** Lets tests answer Stripe's requests themselves; production uses Stripe's own client. */
  httpClient?: Stripe.HttpClient;
};

// Stripe takes ISK and UGX with two decimals that are always 00, and MGA with
// none, unlike ISO 4217, which LobbyStack's amounts follow.
const STRIPE_TWO_DECIMAL_FORMAT = new Set(["ISK", "UGX"]);
const STRIPE_ZERO_DECIMAL = new Set(["MGA"]);

/** An amount in LobbyStack's smallest unit as Stripe's API takes it. */
export function stripeUnitAmount(amountMinor: number, currency: string): number {
  const ours = currencyFractionDigits(currency);
  const stripe = STRIPE_TWO_DECIMAL_FORMAT.has(currency) ? 2 : STRIPE_ZERO_DECIMAL.has(currency) ? 0 : ours;
  const amount = amountMinor * 10 ** (stripe - ours);
  if (!Number.isInteger(amount)) throw Object.assign(new Error(`Stripe takes ${currency} amounts in whole units.`), { status: 400, code: "invalid_amount" });
  return amount;
}

/**
 * The meter each kind of overage goes to on a partner's account, and the
 * product its price sells, whose name the business's invoices show. A meter
 * sums what the overage costs in the currency's major unit, and its price
 * charges one major unit for each, so an invoice charges what LobbyStack
 * priced at the rates each usage event recorded, whatever the partner's
 * rates are now. Partners can rename the products in their Stripe Dashboard.
 */
export const OVERAGE_METERS: Record<OverageMeter, { eventName: string; productName: string }> = {
  voice: { eventName: "lobbystack_call_overage", productName: "Call overage" },
  chat: { eventName: "lobbystack_chat_overage", productName: "Chat overage" },
};

/** The lookup key of a meter's price in a currency, which finds the price again on the account. */
export function overagePriceLookupKey(meter: OverageMeter, currency: string): string {
  return `lobbystack_${meter}_overage_${currency.toLowerCase()}`;
}

/** An overage's cost as its meter counts it: in the currency's major unit, as a decimal, to a ten-thousandth of the smallest unit. */
export function overageMeterValue(amountMinor: number, currency: string): string {
  const digits = currencyFractionDigits(currency);
  const value = (amountMinor / 10 ** digits).toFixed(digits + 4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return value === "-0" ? "0" : value;
}

/** What one major unit of a currency costs as Stripe's API takes it: the unit amount of every overage price. */
export function overageUnitAmount(currency: string): number {
  return stripeUnitAmount(10 ** currencyFractionDigits(currency), currency);
}

function objectId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

/**
 * The subscription an event's object is about: a subscription event's own, the
 * one a subscription checkout started, or the one an invoice bills, which
 * Stripe names under parent.subscription_details on current API versions.
 */
export function eventSubscriptionId(type: string, object: Record<string, unknown>): string | null {
  if (type.startsWith("customer.subscription.")) return objectId(object.id);
  if (type.startsWith("checkout.session.")) return object.mode === "subscription" ? objectId(object.subscription) : null;
  if (type.startsWith("invoice.")) {
    const parent = object.parent as { subscription_details?: { subscription?: unknown } | null } | null | undefined;
    return objectId(parent?.subscription_details?.subscription) ?? objectId(object.subscription);
  }
  return null;
}

/** A subscription as LobbyStack keeps it, from Stripe's subscription object. Its period end lives on its items. */
export function subscriptionFromStripe(subscription: Stripe.Subscription): StripeConnectSubscription {
  const periodEnds = subscription.items.data.map((item) => item.current_period_end).filter((value): value is number => typeof value === "number");
  return {
    subscriptionId: subscription.id,
    customerId: objectId(subscription.customer) ?? "",
    status: subscription.status,
    currentPeriodEnd: periodEnds.length ? new Date(Math.max(...periodEnds) * 1000) : null,
    metadata: { ...subscription.metadata },
  };
}

// Tags these checkouts in the partner's Dashboard, so it can tell them from its own.
const CHECKOUT_INTEGRATION_IDENTIFIER = "lobbystack_package_checkout_qvkrmhwt";

/** The connected account as LobbyStack keeps it, from Stripe's account object. */
export function connectAccountFromStripe(account: Stripe.Account): StripeConnectAccount {
  return {
    accountId: account.id,
    country: account.country?.toUpperCase() ?? null,
    currency: account.default_currency?.toUpperCase() ?? null,
    detailsSubmitted: account.details_submitted === true,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

export class StripeConnectAdapter implements StripeConnectProvider {
  private readonly stripe: Stripe;

  constructor(private readonly config: StripeConnectConfig) {
    // A certification run must never reach a live Stripe account.
    if (isCertificationMode(process.env) && !/^(sk|rk)_test_/.test(config.secretKey)) throw new Error("CERTIFICATION_REQUIRES_BILLING_SANDBOX");
    this.stripe = new Stripe(config.secretKey, {
      maxNetworkRetries: 2,
      timeout: 15_000,
      appInfo: { name: "LobbyStack" },
      ...(config.httpClient ? { httpClient: config.httpClient } : {}),
    });
  }

  async createOnboardingLink(input: OnboardingLinkInput): Promise<{ accountId: string; url: string }> {
    let accountId = input.accountId;
    if (!accountId) {
      if (!input.country) throw Object.assign(new Error("Choose the country your business is in."), { status: 400, code: "invalid_country" });
      // The partner gets the full Stripe Dashboard and handles its own refunds
      // and disputes, Stripe collects its fees from the partner, and Stripe
      // covers losses on the account, as a standard account does.
      const account = await this.stripe.accounts.create({
        country: input.country,
        controller: {
          stripe_dashboard: { type: "full" },
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
        },
        metadata: input.metadata,
      }, { idempotencyKey: input.idempotencyKey });
      accountId = account.id;
    }
    const link = await this.stripe.accountLinks.create({ account: accountId, type: "account_onboarding", return_url: input.returnUrl, refresh_url: input.refreshUrl });
    return { accountId, url: link.url };
  }

  async retrieveAccount(accountId: string): Promise<StripeConnectAccount> {
    return connectAccountFromStripe(await this.stripe.accounts.retrieve(accountId));
  }

  async upsertPackagePrice(accountId: string, terms: PackageTerms): Promise<PackagePrices> {
    const onAccount = { stripeAccount: accountId };
    const metadata = { lobbystack_package_id: terms.packageId };
    if (terms.prices) {
      const { productId, priceId, setupPriceId } = terms.prices;
      // A price that stops selling first, so its product is never for sale without one.
      if (!terms.active) {
        for (const id of [priceId, setupPriceId]) if (id) await this.stripe.prices.update(id, { active: false }, onAccount);
      }
      await this.stripe.products.update(productId, { name: terms.name, active: terms.active }, onAccount);
      return terms.prices;
    }
    const currency = terms.currency.toLowerCase();
    // Each key names one object of one package, so a retried save never makes a second.
    const product = await this.stripe.products.create({ name: terms.name, active: terms.active, metadata }, { ...onAccount, idempotencyKey: `package:${terms.packageId}:product` });
    const price = await this.stripe.prices.create({
      product: product.id,
      currency,
      unit_amount: stripeUnitAmount(terms.monthlyPriceMinor, terms.currency),
      recurring: { interval: "month" },
      metadata: { ...metadata, lobbystack_price: "monthly" },
    }, { ...onAccount, idempotencyKey: `package:${terms.packageId}:monthly` });
    // The setup fee is a one-time price on the same product, which checkout charges with the first month.
    const setup = terms.setupFeeMinor === null ? null : await this.stripe.prices.create({
      product: product.id,
      currency,
      unit_amount: stripeUnitAmount(terms.setupFeeMinor, terms.currency),
      metadata: { ...metadata, lobbystack_price: "setup_fee" },
    }, { ...onAccount, idempotencyKey: `package:${terms.packageId}:setup` });
    return { productId: product.id, priceId: price.id, setupPriceId: setup?.id ?? null };
  }

  async createCheckout(accountId: string, input: PackageCheckoutInput): Promise<PackageCheckout> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: input.priceId, quantity: 1 }, ...(input.setupPriceId ? [{ price: input.setupPriceId, quantity: 1 }] : [])],
      ...(input.customerId ? { customer: input.customerId } : input.customerEmail ? { customer_email: input.customerEmail } : {}),
      client_reference_id: input.clientReferenceId,
      metadata: input.metadata,
      // Every package renews at 00:00 UTC on the 1st, so each invoice covers the
      // calendar month the business's overage cap counts. The first invoice
      // charges the part of the month left, and Stripe works out the next 1st
      // when the subscription starts, even when the payer finishes after it.
      subscription_data: { metadata: input.metadata, billing_cycle_anchor_config: { day_of_month: 1, hour: 0, minute: 0, second: 0 }, proration_behavior: "create_prorations" },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      locale: "auto",
      integration_identifier: CHECKOUT_INTEGRATION_IDENTIFIER,
    }, { stripeAccount: accountId, idempotencyKey: input.idempotencyKey });
    if (!session.url) throw new Error("Stripe returned a checkout without a link.");
    return { sessionId: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000) };
  }

  async expireCheckout(accountId: string, sessionId: string): Promise<void> {
    await this.stripe.checkout.sessions.expire(sessionId, {}, { stripeAccount: accountId });
  }

  async createPortal(accountId: string, customerId: string, returnUrl: string): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl }, { stripeAccount: accountId });
    return { url: session.url };
  }

  async retrieveSubscription(accountId: string, subscriptionId: string): Promise<StripeConnectSubscription> {
    return subscriptionFromStripe(await this.stripe.subscriptions.retrieve(subscriptionId, {}, { stripeAccount: accountId }));
  }

  async cancelSubscription(accountId: string, subscriptionId: string): Promise<StripeConnectSubscription> {
    const onAccount = { stripeAccount: accountId };
    // Stripe refuses to cancel a subscription that already ended, so a retry reads it first.
    const current = await this.stripe.subscriptions.retrieve(subscriptionId, {}, onAccount);
    if (current.status === "canceled" || current.status === "incomplete_expired") return subscriptionFromStripe(current);
    return subscriptionFromStripe(await this.stripe.subscriptions.cancel(subscriptionId, {}, onAccount));
  }

  async addOverageToSubscription(accountId: string, input: { subscriptionId: string; meter: OverageMeter; currency: string }): Promise<{ subscriptionItemId: string }> {
    const onAccount = { stripeAccount: accountId };
    const subscription = await this.stripe.subscriptions.retrieve(input.subscriptionId, {}, onAccount);
    if (subscription.currency.toUpperCase() !== input.currency) {
      throw Object.assign(new Error(`The subscription is in ${subscription.currency.toUpperCase()}, not ${input.currency}.`), { status: 409, code: "currency_mismatch" });
    }
    const meterId = await this.overageMeter(accountId, input.meter);
    // A second item on the same meter would bill the same usage twice.
    const existing = subscription.items.data.find((item) => item.price.recurring?.meter === meterId);
    if (existing) return { subscriptionItemId: existing.id };
    const priceId = await this.overagePrice(accountId, input.meter, meterId, input.currency);
    // A metered item charges nothing until the meter counts usage, so adding one mid-period prorates nothing.
    const item = await this.stripe.subscriptionItems.create({ subscription: input.subscriptionId, price: priceId, proration_behavior: "none" }, { ...onAccount, idempotencyKey: `overage-item:${input.subscriptionId}:${input.meter}` });
    return { subscriptionItemId: item.id };
  }

  /** The account's meter for a kind of overage, made the first time. A meter the partner deactivated in its Dashboard counts again. */
  private async overageMeter(accountId: string, meter: OverageMeter): Promise<string> {
    const onAccount = { stripeAccount: accountId };
    const { eventName, productName } = OVERAGE_METERS[meter];
    for await (const found of this.stripe.billing.meters.list({ limit: 100 }, onAccount)) {
      if (found.event_name !== eventName) continue;
      if (found.status !== "active") await this.stripe.billing.meters.reactivate(found.id, {}, onAccount);
      return found.id;
    }
    const created = await this.stripe.billing.meters.create({
      display_name: productName,
      event_name: eventName,
      default_aggregation: { formula: "sum" },
      customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
      value_settings: { event_payload_key: "value" },
    }, { ...onAccount, idempotencyKey: `overage-meter:${meter}` });
    return created.id;
  }

  /**
   * The meter's monthly price in the currency, which charges one major unit
   * for each one the meter counts, with its product, made the first time. A
   * lookup key names one price at a time, archived or not, so a price or
   * product the partner archived in its Dashboard goes back on sale: a new
   * price couldn't take the key, and the next business couldn't bill its
   * overage.
   */
  private async overagePrice(accountId: string, meter: OverageMeter, meterId: string, currency: string): Promise<string> {
    const onAccount = { stripeAccount: accountId };
    const lookupKey = overagePriceLookupKey(meter, currency);
    const [found] = (await this.stripe.prices.list({ lookup_keys: [lookupKey], limit: 1, expand: ["data.product"] }, onAccount)).data;
    if (found) {
      const product = found.product;
      if (typeof product === "object" && product.deleted !== true && !product.active) await this.stripe.products.update(product.id, { active: true }, onAccount);
      if (!found.active) await this.stripe.prices.update(found.id, { active: true }, onAccount);
      return found.id;
    }
    const metadata = { lobbystack_overage: meter };
    const price = await this.stripe.prices.create({
      currency: currency.toLowerCase(),
      unit_amount: overageUnitAmount(currency),
      recurring: { interval: "month", usage_type: "metered", meter: meterId },
      product_data: { name: OVERAGE_METERS[meter].productName, metadata },
      lookup_key: lookupKey,
      metadata,
    }, { ...onAccount, idempotencyKey: `overage-price:${meter}:${currency}` });
    return price.id;
  }

  async reportOverage(accountId: string, report: OverageReport): Promise<void> {
    try {
      // The idempotency key makes a retry get the first answer back; the identifier makes Stripe count the event once.
      await this.stripe.billing.meterEvents.create({
        event_name: OVERAGE_METERS[report.meter].eventName,
        identifier: report.identifier,
        payload: { stripe_customer_id: report.customerId, value: overageMeterValue(report.amountMinor, report.currency) },
      }, { stripeAccount: accountId, idempotencyKey: `overage-report:${report.identifier}` });
    } catch (error) {
      // Stripe already counted an event under this identifier, as an earlier attempt sent it.
      if ((error as { code?: unknown } | null)?.code === "duplicate_meter_event") return;
      throw error;
    }
  }

  verifyWebhook(body: string, signature: string): StripeConnectEvent {
    const event = this.stripe.webhooks.constructEvent(body, signature, this.config.webhookSecret);
    const object = event.data.object as unknown as Record<string, unknown>;
    return {
      id: event.id,
      type: event.type,
      createdAt: new Date(event.created * 1000),
      accountId: event.account ?? null,
      account: event.type === "account.updated" ? connectAccountFromStripe(event.data.object) : null,
      subscriptionId: eventSubscriptionId(event.type, object),
      object,
    };
  }
}

/** The deployment's Stripe Connect client, or null when its key and webhook secret aren't both set. */
export function createStripeConnectProvider(env: Record<string, string | undefined> = process.env): StripeConnectProvider | null {
  if (!partnerFeatures(env).stripeConnect) return null;
  return new StripeConnectAdapter({ secretKey: env.STRIPE_CONNECT_SECRET_KEY!.trim(), webhookSecret: env.STRIPE_CONNECT_WEBHOOK_SECRET!.trim() });
}
