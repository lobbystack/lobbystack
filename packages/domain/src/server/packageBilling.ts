import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { auditLogs, billingAccounts, businesses, businessInvitations, enqueueOutbox, partnerMembers, partnerPackages, partnerStripeAccounts, providerEvents, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import type { StripeConnectEvent, StripeConnectProvider, StripeConnectSubscription } from "@lobbystack/providers";
import { hasLivePackageSubscription, isPackageOverageAmount, isUuid, packageOverageIn, packageSubscriptionStatus, type PackageOverage, type PackageSubscriptionStatus, type PartnerRole } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import { AuthorizationError, requireTeamMembership } from "../authz";
import type { DomainContext } from "./context";
import type { PartnerActor, PartnerMemberActor } from "./partners";
import { recordProductEventInTransaction } from "./productEvents";

// Selling a package to a partner's business (ADR 0009). The partner picks a
// package for each business, or bills it outside LobbyStack. The business's
// owner pays at a Stripe Checkout on the partner's own account, opened from
// the invitation link or from the business's billing page, so the
// subscription and its payments are direct charges the host never holds.
// The Connect webhook reads each subscription back from Stripe and keeps the
// business's billing account current, which loadEntitlement reads. Without
// Stripe Connect, context.stripeConnect is absent and every partner business
// is billed outside LobbyStack.

/**
 * What a partner's business is sold, as the console's Businesses page shows
 * owners and admins: its package, whether it pays, and its overage, in the
 * package's currency.
 */
export type PartnerBusinessBilling =
  | { kind: "outside" }
  | { kind: "package"; packageId: string; packageName: string; status: PackageSubscriptionStatus; overage: PackageOverage };

/**
 * A package as the business paying for it sees it: what it includes each
 * month and whether it's paid. Only Stripe shows a business prices, at its
 * checkout, on its invoices and in the partner's customer portal.
 */
export type PackageOffer = {
  packageName: string;
  allowance: { voiceMinutes: number; chats: number };
  status: PackageSubscriptionStatus;
};

/** The package an invitation's recipient pays for, and whether its checkout can open now. */
export type InvitationPayment = PackageOffer & {
  /** False while the package doesn't sell, such as before the partner's account takes payments: the owner signs in first and pays later. */
  canPay: boolean;
};

/** A partner's business's billing page. */
export type PackageBillingPage =
  | { billing: "outside" }
  | {
    billing: "package";
    offer: PackageOffer;
    /** When the period the business last paid for ends. */
    currentPeriodEnd: string | null;
    /** Whether the partner's customer portal can open: the business paid once, on an account the deployment still reaches. */
    canOpenPortal: boolean;
    /** Whether a checkout can start: the subscription isn't live, and the partner can take payments. */
    canSubscribe: boolean;
  };

type AccountRow = typeof billingAccounts.$inferSelect;
type PackageRow = typeof partnerPackages.$inferSelect;
type StripeAccountRow = typeof partnerStripeAccounts.$inferSelect;

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

const notConfigured = () => failure("Stripe Connect isn't set up on this deployment.", 409, "stripe_not_configured");
const packageNotFound = () => failure("Package not found.", 404, "package_not_found");
const businessNotFound = () => failure("Business not found.", 404, "business_not_found");
const invitationInvalid = () => failure("This invitation link is invalid or expired.", 409, "invitation_invalid");
const billedOutside = () => failure("This business is billed outside LobbyStack.", 409, "billed_outside");
const subscriptionActive = () => failure("This business already pays for its package.", 409, "subscription_active");
const paymentsUnavailable = () => failure("This business's partner can't take payments right now.", 409, "payments_unavailable");

/**
 * The lock every change to a business's billing account takes, the same one
 * Polar's reconcile takes. Releasing or deleting a partner's business takes
 * it before the business's row lock, as the Connect webhook's writes need.
 */
export async function lockBusinessBillingAccount(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing-reconcile:${businessId}`}, 0))`);
}

/**
 * The person's place on the business's own team, as an owner or admin. A
 * partner open doesn't count: the business pays its partner, and the
 * partner's people see its billing in the console, members never.
 */
const requireTeamAdmin = (tx: DatabaseTransaction, input: { userId: string; businessId: string }) => requireTeamMembership(tx, { ...input, minimumRole: "business_admin" });

async function readAccount(tx: DatabaseTransaction, businessId: string): Promise<AccountRow | null> {
  return (await tx.select().from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0] ?? null;
}

async function readPartnerAccount(tx: DatabaseTransaction, partnerId: string): Promise<StripeAccountRow | null> {
  return (await tx.select().from(partnerStripeAccounts).where(eq(partnerStripeAccounts.partnerId, partnerId)).limit(1))[0] ?? null;
}

/** The business's partner, read as its owner: a partner member isn't on the business's team. */
async function businessPartner(tx: DatabaseTransaction, businessId: string): Promise<string | null> {
  const [row] = (await tx.execute<{ partnerId: string | null }>(sql`select app.business_partner(${businessId}::uuid) as "partnerId"`)).rows;
  return row?.partnerId ?? null;
}

/** Whether the package's prices still sell: it's for sale, on the partner's connected account, which can take payments. */
function sells(pkg: PackageRow, partnerAccount: StripeAccountRow | null): boolean {
  return !pkg.archivedAt && Boolean(partnerAccount && !partnerAccount.disconnectedAt && partnerAccount.chargesEnabled && partnerAccount.stripeAccountId === pkg.stripeAccountId);
}

function offerFrom(pkg: PackageRow, account: AccountRow | null): PackageOffer {
  return {
    packageName: pkg.name,
    allowance: { voiceMinutes: pkg.voiceMinutes, chats: pkg.chats },
    status: packageSubscriptionStatus(account?.stripeSubscriptionState),
  };
}

// Closing a checkout keeps its id: the next checkout's idempotency key names
// it, so it never gets an older checkout back from Stripe.
const NO_CHECKOUT = { stripeCheckoutUrl: null, stripeCheckoutExpiresAt: null } as const;

/** A checkout someone may still pay, which a change to the business's billing must close. */
export type OpenCheckout = { accountId: string; sessionId: string };

function openCheckoutOf(account: AccountRow | null, partnerAccount: StripeAccountRow | null): OpenCheckout | null {
  if (!account?.stripeCheckoutSessionId || !account.stripeCheckoutUrl || !account.stripeCheckoutExpiresAt || account.stripeCheckoutExpiresAt <= new Date()) return null;
  const accountId = account.stripeAccountId ?? partnerAccount?.stripeAccountId;
  return accountId ? { accountId, sessionId: account.stripeCheckoutSessionId } : null;
}

/**
 * Whether a live subscription holds the business's package: it pays, on the
 * partner's connected account, on a deployment that would hear it end. A
 * live subscription on an account the partner disconnected, or on a
 * deployment without Stripe Connect, holds nothing.
 */
function holdsPackage(account: AccountRow | null, partnerAccount: StripeAccountRow | null, stripeConnect: boolean): boolean {
  if (!account?.packageId || !hasLivePackageSubscription(account.stripeSubscriptionState)) return false;
  return stripeConnect && Boolean(partnerAccount && !partnerAccount.disconnectedAt && partnerAccount.stripeAccountId === account.stripeAccountId);
}

/** Closes a checkout nobody should pay any more. It may have closed already, which is just as good. */
async function expireQuietly(stripe: StripeConnectProvider | null | undefined, checkout: OpenCheckout | null): Promise<void> {
  if (!stripe || !checkout) return;
  try {
    await stripe.expireCheckout(checkout.accountId, checkout.sessionId);
  } catch {
    // Paid or expired since: a paid one starts a subscription the webhook records, and the partner refunds it if it shouldn't have.
  }
}

/**
 * Sells the business a package, or bills it outside LobbyStack when
 * packageId is null. The package must be the partner's own, for sale, and
 * on its connected account. A business whose subscription is live keeps its
 * package: the partner ends the subscription in Stripe first. That holds
 * only while the deployment would hear of it ending, so a live subscription
 * on an account the partner disconnected, or on a deployment without Stripe
 * Connect, doesn't hold the package, and the change forgets it. Returns the
 * checkout the change leaves nobody to pay, for the caller to close once
 * this commits. The transaction acts as the system actor, scoped to the
 * business.
 */
export async function setBusinessPackageInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; partnerId: string; packageId: string | null; stripeConnect: boolean },
): Promise<{ changed: boolean; closes: OpenCheckout | null }> {
  await lockBusinessBillingAccount(tx, input.businessId);
  const account = await readAccount(tx, input.businessId);
  if ((account?.packageId ?? null) === input.packageId) return { changed: false, closes: null };
  const partnerAccount = await readPartnerAccount(tx, input.partnerId);
  if (input.packageId) {
    if (!input.stripeConnect) throw notConfigured();
    const [pkg] = await tx.select().from(partnerPackages).where(and(eq(partnerPackages.id, input.packageId), eq(partnerPackages.partnerId, input.partnerId))).limit(1);
    if (!pkg || pkg.archivedAt) throw packageNotFound();
    if (!partnerAccount || partnerAccount.disconnectedAt || partnerAccount.stripeAccountId !== pkg.stripeAccountId) throw failure("Connect your Stripe account before you sell packages.", 409, "stripe_not_connected");
  }
  if (holdsPackage(account, partnerAccount, input.stripeConnect)) {
    throw failure("This business pays for its package through Stripe. Cancel its subscription in your Stripe Dashboard before you change how it's billed.", 409, "subscription_active");
  }
  const live = hasLivePackageSubscription(account?.stripeSubscriptionState);
  const closes = openCheckoutOf(account, null);
  // A live subscription the change lets go of must not make the next package live.
  const forgets = live ? { stripeSubscriptionId: null, stripeSubscriptionState: null, stripeCurrentPeriodEnd: null } : {};
  const values = { packageId: input.packageId, ...NO_CHECKOUT, ...forgets };
  await tx.insert(billingAccounts).values({ businessId: input.businessId, billingKey: `business:${input.businessId}`, ...values })
    .onConflictDoUpdate({ target: billingAccounts.businessId, set: { ...values, updatedAt: new Date() } });
  return { changed: true, closes };
}

/**
 * Lets go of the package of a business that's leaving its partner, as
 * releasing or deleting it does, by the rule setPartnerBusinessBilling
 * follows: refused while its subscription is live and the deployment would
 * hear it end, so its owner never keeps paying the partner for a business the
 * partner no longer runs. Returns the checkout nobody should pay any more,
 * for the caller to close once this commits. The transaction acts as the
 * system actor, scoped to the business, which must be the partner's.
 */
export async function dropBusinessPackageInTransaction(tx: DatabaseTransaction, input: { businessId: string; partnerId: string; stripeConnect: boolean }): Promise<OpenCheckout | null> {
  try {
    return (await setBusinessPackageInTransaction(tx, { ...input, packageId: null })).closes;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== "subscription_active") throw error;
    throw failure("This business pays for its package through Stripe. Cancel its subscription in your Stripe Dashboard before you release or delete it.", 409, "subscription_active");
  }
}

/** Closes, once its transaction committed, the checkout dropBusinessPackageInTransaction left nobody to pay. */
export async function closeCheckoutQuietly(context: DomainContext, checkout: OpenCheckout | null): Promise<void> {
  await expireQuietly(context.stripeConnect, checkout);
}

/** A business's subscription to its package, on the partner's connected account. */
export type PackageSubscription = { accountId: string; subscriptionId: string };

/**
 * What a business the host is about to delete still takes payments for: the
 * subscription that holds its package, which the worker cancels before the
 * business goes, and the checkout someone may still pay, which it closes.
 * The transaction is the worker's, scoped to the business.
 */
export async function businessPaymentsToEndInTransaction(tx: DatabaseTransaction, input: { businessId: string; partnerId: string; stripeConnect: boolean }): Promise<{ subscription: PackageSubscription | null; checkout: OpenCheckout | null }> {
  await lockBusinessBillingAccount(tx, input.businessId);
  const account = await readAccount(tx, input.businessId);
  const partnerAccount = await readPartnerAccount(tx, input.partnerId);
  const subscription = holdsPackage(account, partnerAccount, input.stripeConnect) && account?.stripeAccountId && account.stripeSubscriptionId
    ? { accountId: account.stripeAccountId, subscriptionId: account.stripeSubscriptionId }
    : null;
  return { subscription, checkout: openCheckoutOf(account, partnerAccount) };
}

/**
 * Lets go of the billing of a business the host deletes at the end of its
 * partner's lifecycle. Unlike dropBusinessPackageInTransaction, it writes
 * nothing, since the billing account goes with the business, and it doesn't
 * wait for the partner to cancel the subscription: the worker cancelled it
 * already. A subscription that still holds the package must be that one, or
 * it refuses with subscription_active, and the business waits for the next
 * run to cancel it. Returns the checkout to close once this commits. The
 * transaction is the worker's, scoped to the business.
 */
export async function endLifecycleBusinessBillingInTransaction(tx: DatabaseTransaction, input: { businessId: string; partnerId: string; stripeConnect: boolean; cancelledSubscriptionId: string | null }): Promise<OpenCheckout | null> {
  await lockBusinessBillingAccount(tx, input.businessId);
  const account = await readAccount(tx, input.businessId);
  const partnerAccount = await readPartnerAccount(tx, input.partnerId);
  if (holdsPackage(account, partnerAccount, input.stripeConnect) && account?.stripeSubscriptionId !== input.cancelledSubscriptionId) {
    throw failure("This business pays for its package through a subscription the worker hasn't cancelled yet.", 409, "subscription_active");
  }
  return openCheckoutOf(account, partnerAccount);
}

/** The actor's role as the database has it now. */
async function readRole(tx: DatabaseTransaction, actor: PartnerMemberActor): Promise<PartnerRole> {
  const [member] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, actor.partnerId), eq(partnerMembers.userId, actor.userId), eq(partnerMembers.status, "active"))).limit(1);
  if (!member) throw new AuthorizationError("You aren't on this partner's team.");
  return member.role;
}

/**
 * Sells one of the partner's businesses a package, or bills it outside
 * LobbyStack with packageId null. Owners and admins can. The business's
 * audit log records the change, and a checkout the change leaves nobody to
 * pay closes.
 */
export async function setPartnerBusinessBilling(context: DomainContext, actor: PartnerActor, input: { businessId: string; packageId: string | null }): Promise<PartnerBusinessBilling> {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't change how a partner's businesses are billed.");
  await withBusinessTransaction(context.db, { userId: actor.userId, actorType: "operator" }, async (tx) => {
    if (await readRole(tx, actor) === "member") throw new AuthorizationError("Only owners and admins can change how a business is billed.");
    if (await businessPartner(tx, input.businessId) !== actor.partnerId.toLowerCase()) throw businessNotFound();
  });
  const outcome = await withBusinessTransaction(context.db, { userId: actor.userId, businessId: input.businessId, actorType: "system" }, async (tx) => {
    const changed = await setBusinessPackageInTransaction(tx, { businessId: input.businessId, partnerId: actor.partnerId, packageId: input.packageId, stripeConnect: Boolean(context.stripeConnect) });
    if (changed.changed) await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: actor.userId, eventType: "partner.business_billing_changed", entityType: "business", entityId: input.businessId, payload: { partnerId: actor.partnerId, packageId: input.packageId } });
    return changed;
  });
  await expireQuietly(context.stripeConnect, outcome.closes);
  const billing = (await withBusinessTransaction(context.db, { userId: actor.userId, actorType: "operator" }, async (tx) => await listPartnerBusinessBillingIn(tx, actor.partnerId))).get(input.businessId);
  return billing ?? { kind: "outside" };
}

/** What setPartnerBusinessOverage takes, as the console sends it: the values are checked here. */
export type PartnerBusinessOverageInput = { businessId: string; enabled: unknown; voiceMinuteRateMinor: unknown; chatRateMinor: unknown; capMinor: unknown };

/**
 * Sets one of the partner's businesses' overage on its package: on or off,
 * what each minute and chat past the package's allowance costs, and the
 * monthly cap on what that comes to, or null for none, each a whole number
 * of the package currency's smallest unit. With overage on, the business
 * keeps answering past its allowance while its overage stays under the cap
 * and the partner's pool has room. With it off or at the cap, calls forward
 * and chat shows its "can't reply" message, as when the pool runs out. Rates
 * and the cap stay when overage goes off, so turning it on again restores
 * them. A business billed outside LobbyStack has no overage, since nothing
 * bills it there. Owners and admins can, and the business's audit log
 * records each change.
 */
export async function setPartnerBusinessOverage(context: DomainContext, actor: PartnerActor, input: PartnerBusinessOverageInput): Promise<PartnerBusinessBilling> {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't change a business's overage.");
  if (typeof input.enabled !== "boolean") throw failure("enabled must be true or false.", 400, "invalid_overage");
  if (!isPackageOverageAmount(input.voiceMinuteRateMinor) || !isPackageOverageAmount(input.chatRateMinor)) {
    throw failure("Enter each rate as a whole number of the currency's smallest unit, from 0 to 99,999,999.", 400, "invalid_overage_rate");
  }
  if (input.capMinor !== null && !isPackageOverageAmount(input.capMinor)) {
    throw failure("Enter the cap as a whole number of the currency's smallest unit, up to 99,999,999, or null for no cap.", 400, "invalid_overage_cap");
  }
  if (!context.stripeConnect) throw notConfigured();
  const terms = { enabled: input.enabled, voiceMinuteRateMinor: input.voiceMinuteRateMinor, chatRateMinor: input.chatRateMinor, capMinor: input.capMinor };
  await withBusinessTransaction(context.db, { userId: actor.userId, actorType: "operator" }, async (tx) => {
    if (await readRole(tx, actor) === "member") throw new AuthorizationError("Only owners and admins can change a business's overage.");
    if (await businessPartner(tx, input.businessId) !== actor.partnerId.toLowerCase()) throw businessNotFound();
  });
  await withBusinessTransaction(context.db, { userId: actor.userId, businessId: input.businessId, actorType: "system" }, async (tx) => {
    // Releasing the business and changing its package take this lock too, so neither moves under the change.
    await lockBusinessBillingAccount(tx, input.businessId);
    if (await businessPartner(tx, input.businessId) !== actor.partnerId.toLowerCase()) throw businessNotFound();
    const account = await readAccount(tx, input.businessId);
    const [pkg] = account?.packageId ? await tx.select({ currency: partnerPackages.currency }).from(partnerPackages).where(eq(partnerPackages.id, account.packageId)).limit(1) : [];
    if (!account || !pkg) throw billedOutside();
    const currency = pkg.currency.toUpperCase();
    const before = packageOverageIn(currency, { enabled: account.overageEnabled, currency: account.overageCurrency, voiceMinuteRateMinor: account.overageVoiceMinuteRateMinor, chatRateMinor: account.overageChatRateMinor, capMinor: account.overageCapMinor });
    const changed = before.enabled !== terms.enabled || before.voiceMinuteRateMinor !== terms.voiceMinuteRateMinor || before.chatRateMinor !== terms.chatRateMinor || before.capMinor !== terms.capMinor || account.overageCurrency !== currency;
    if (!changed) return;
    await tx.update(billingAccounts).set({
      overageEnabled: terms.enabled,
      overageCurrency: currency,
      overageVoiceMinuteRateMinor: terms.voiceMinuteRateMinor,
      overageChatRateMinor: terms.chatRateMinor,
      overageCapMinor: terms.capMinor,
      updatedAt: new Date(),
    }).where(eq(billingAccounts.businessId, input.businessId));
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: actor.userId, eventType: "partner.business_overage_changed", entityType: "business", entityId: input.businessId, payload: { partnerId: actor.partnerId, currency, ...terms } });
    // The business's usage page shows whether it can still answer, which this changes.
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "billing_account", aggregateId: input.businessId, dedupeKey: `billing:${input.businessId}:overage:${randomUUID()}`, payload: { type: "billing.updated", entityId: input.businessId } });
  });
  const billing = (await withBusinessTransaction(context.db, { userId: actor.userId, actorType: "operator" }, async (tx) => await listPartnerBusinessBillingIn(tx, actor.partnerId))).get(input.businessId);
  return billing ?? { kind: "outside" };
}

/**
 * What each of the partner's businesses is sold, and whether it pays, by
 * business. Only an owner or admin acting as themselves gets any; members
 * get an empty map. A deployment without Stripe Connect bills them all
 * outside LobbyStack, which the caller shows when it has no client.
 */
export async function listPartnerBusinessBillingIn(tx: DatabaseTransaction, partnerId: string): Promise<Map<string, PartnerBusinessBilling>> {
  const rows = await tx.execute<{
    businessId: string;
    packageId: string | null;
    packageName: string | null;
    packageCurrency: string | null;
    subscriptionState: string | null;
    overageEnabled: boolean | null;
    overageCurrency: string | null;
    voiceMinuteRateMinor: number | null;
    chatRateMinor: number | null;
    capMinor: number | null;
  }>(sql`select business_id as "businessId", package_id as "packageId", package_name as "packageName", package_currency as "packageCurrency", subscription_state as "subscriptionState",
    overage_enabled as "overageEnabled", overage_currency as "overageCurrency", overage_voice_minute_rate_minor as "voiceMinuteRateMinor", overage_chat_rate_minor as "chatRateMinor", overage_cap_minor as "capMinor"
    from app.list_partner_business_billing(${partnerId}::uuid)`);
  return new Map(rows.rows.map((row) => [row.businessId, row.packageId && row.packageName && row.packageCurrency
    ? {
      kind: "package",
      packageId: row.packageId,
      packageName: row.packageName,
      status: packageSubscriptionStatus(row.subscriptionState),
      overage: packageOverageIn(row.packageCurrency, { enabled: row.overageEnabled === true, currency: row.overageCurrency, voiceMinuteRateMinor: Number(row.voiceMinuteRateMinor ?? 0), chatRateMinor: Number(row.chatRateMinor ?? 0), capMinor: row.capMinor === null ? null : Number(row.capMinor) }),
    }
    : { kind: "outside" }]));
}

/**
 * What an invitation's recipient pays before they sign in: the business's
 * package when the invitation makes them its owner, the business belongs to
 * a partner, and the deployment has Stripe Connect. Null for anything billed
 * outside LobbyStack. Its checkout opens only while the package sells, as
 * the checkout itself checks. The transaction acts as the system actor,
 * scoped to the business.
 */
export async function invitationOfferInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; role: string; transfersOwnership: boolean; stripeConnect: boolean },
): Promise<InvitationPayment | null> {
  if (!input.stripeConnect || input.role !== "business_owner" || input.transfersOwnership) return null;
  const account = await readAccount(tx, input.businessId);
  if (!account?.packageId) return null;
  const [pkg] = await tx.select().from(partnerPackages).where(eq(partnerPackages.id, account.packageId)).limit(1);
  if (!pkg) return null;
  const partnerId = await businessPartner(tx, input.businessId);
  const partnerAccount = partnerId ? await readPartnerAccount(tx, partnerId) : null;
  return { ...offerFrom(pkg, account), canPay: sells(pkg, partnerAccount) && !hasLivePackageSubscription(account.stripeSubscriptionState) };
}

type CheckoutReturn = { successUrl: string; cancelUrl: string };

/**
 * Sends the business to a Stripe Checkout on its partner's account for its
 * package. An open checkout for the same package is reused, so two clicks
 * can't start two subscriptions; one for another package closes first.
 * Refused when the business is billed outside LobbyStack, already pays, or
 * its partner can't take payments.
 */
async function checkoutFor(
  context: DomainContext,
  input: { businessId: string; userId?: string; urls: CheckoutReturn; check: (tx: DatabaseTransaction) => Promise<{ customerEmail: string | null }> },
): Promise<{ url: string }> {
  const stripe = context.stripeConnect;
  if (!stripe) throw notConfigured();
  const rls = { ...(input.userId ? { userId: input.userId } : {}), businessId: input.businessId, actorType: "system" as const };
  const plan = await withBusinessTransaction(context.db, rls, async (tx) => {
    const { customerEmail } = await input.check(tx);
    const partnerId = await businessPartner(tx, input.businessId);
    if (!partnerId) throw businessNotFound();
    const account = await readAccount(tx, input.businessId);
    if (!account?.packageId) throw billedOutside();
    if (hasLivePackageSubscription(account.stripeSubscriptionState)) throw subscriptionActive();
    const [pkg] = await tx.select().from(partnerPackages).where(eq(partnerPackages.id, account.packageId)).limit(1);
    if (!pkg) throw billedOutside();
    const partnerAccount = await readPartnerAccount(tx, partnerId);
    if (!sells(pkg, partnerAccount)) throw paymentsUnavailable();
    const open = openCheckoutOf(account, partnerAccount);
    // Give the person time to pay before the reused checkout closes.
    const reusable = open && account.stripeCheckoutUrl && account.stripeAccountId === pkg.stripeAccountId && account.stripeCheckoutExpiresAt! > new Date(Date.now() + 10 * 60_000);
    return { pkg, account, customerEmail, reusable: reusable ? account.stripeCheckoutUrl : null, closes: reusable ? null : open };
  });
  if (plan.reusable) return { url: plan.reusable };
  await expireQuietly(stripe, plan.closes);
  const { pkg, account, customerEmail } = plan;
  // A customer on another account can't pay on this one, as after the partner reconnected.
  const customerId = account.stripeAccountId === pkg.stripeAccountId ? account.stripeCustomerId : null;
  const previous = account.stripeCheckoutSessionId;
  // Stripe refuses a key it saw with other parameters, so the key names them too.
  const asked = createHash("sha256").update(JSON.stringify([customerId, customerEmail, input.urls.successUrl, input.urls.cancelUrl])).digest("hex").slice(0, 16);
  const checkout = await stripe.createCheckout(pkg.stripeAccountId, {
    priceId: pkg.stripePriceId,
    setupPriceId: pkg.stripeSetupPriceId,
    customerId,
    customerEmail,
    ...input.urls,
    // The same click retried gets the same checkout; one after it closed gets a new one.
    idempotencyKey: `package-checkout:${input.businessId}:${pkg.id}:${previous ?? "first"}:${asked}`,
    clientReferenceId: input.businessId,
    metadata: { lobbystack_business_id: input.businessId, lobbystack_package_id: pkg.id },
  });
  const stored = await withBusinessTransaction(context.db, rls, async (tx) => {
    await lockBusinessBillingAccount(tx, input.businessId);
    const [saved] = await tx.update(billingAccounts).set({ stripeAccountId: pkg.stripeAccountId, stripeCheckoutSessionId: checkout.sessionId, stripeCheckoutUrl: checkout.url, stripeCheckoutExpiresAt: checkout.expiresAt, updatedAt: new Date() })
      .where(and(eq(billingAccounts.businessId, input.businessId), eq(billingAccounts.packageId, pkg.id), previous ? eq(billingAccounts.stripeCheckoutSessionId, previous) : sql`${billingAccounts.stripeCheckoutSessionId} is null`))
      .returning({ url: billingAccounts.stripeCheckoutUrl });
    if (saved) return saved.url;
    // A second click at the same moment got the same checkout from Stripe, and stored it first.
    const current = await readAccount(tx, input.businessId);
    return current?.packageId === pkg.id && current.stripeCheckoutSessionId === checkout.sessionId ? current.stripeCheckoutUrl : null;
  });
  if (stored) return { url: stored };
  // Someone changed the business's billing while Stripe made this checkout, so nobody should pay it.
  await expireQuietly(stripe, { accountId: pkg.stripeAccountId, sessionId: checkout.sessionId });
  // Its id moves the next checkout's idempotency key on, or a switch back to this package would get it back from Stripe, closed.
  await withBusinessTransaction(context.db, rls, async (tx) => {
    await lockBusinessBillingAccount(tx, input.businessId);
    await tx.update(billingAccounts).set({ stripeCheckoutSessionId: checkout.sessionId, ...NO_CHECKOUT, updatedAt: new Date() })
      .where(and(eq(billingAccounts.businessId, input.businessId), previous ? eq(billingAccounts.stripeCheckoutSessionId, previous) : sql`${billingAccounts.stripeCheckoutSessionId} is null`));
  });
  throw failure("This business's billing just changed. Refresh and try again.", 409, "billing_changed");
}

/**
 * The checkout an invitation's link opens, before its recipient signs in: on
 * the partner's domain, for the package of the business the invitation makes
 * them owner of. The payer's email starts as the invited address. Refused on
 * another brand's domain, and for any other invitation.
 */
export async function startInvitationCheckout(
  context: DomainContext,
  input: { tokenHash: string; partnerId: string | null; successUrl: string; cancelUrl: string },
): Promise<{ url: string }> {
  const resolved = await context.db.execute<{ business_id: string }>(sql`select app.resolve_business_by_invitation(${input.tokenHash}) as business_id`);
  const businessId = resolved.rows[0]?.business_id;
  const partnerId = input.partnerId?.toLowerCase();
  if (!businessId || !partnerId) throw invitationInvalid();
  return await checkoutFor(context, {
    businessId,
    urls: { successUrl: input.successUrl, cancelUrl: input.cancelUrl },
    check: async (tx) => {
      const [invitation] = await tx.select({ email: businessInvitations.email, role: businessInvitations.role, transfersOwnership: businessInvitations.transfersOwnership, status: businessInvitations.status, expiresAt: businessInvitations.expiresAt })
        .from(businessInvitations).where(and(eq(businessInvitations.tokenHash, input.tokenHash), eq(businessInvitations.businessId, businessId))).limit(1);
      if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= new Date() || invitation.role !== "business_owner" || invitation.transfersOwnership) throw invitationInvalid();
      // A business shows only on its own partner's domains, and its checkout opens only there.
      if (await businessPartner(tx, businessId) !== partnerId) throw invitationInvalid();
      return { customerEmail: invitation.email };
    },
  });
}

/** The billing page's checkout, for an owner or admin of a partner's business whose subscription isn't live. */
export async function startPackageCheckout(
  context: DomainContext,
  input: { userId: string; businessId: string; email: string | null; successUrl: string; cancelUrl: string },
): Promise<{ url: string }> {
  await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => await requireTeamAdmin(tx, input));
  return await checkoutFor(context, { businessId: input.businessId, userId: input.userId, urls: { successUrl: input.successUrl, cancelUrl: input.cancelUrl }, check: async () => ({ customerEmail: input.email }) });
}

/**
 * A partner's business's billing page, for its owners and admins: its
 * package and whether it pays, or that its partner bills it outside
 * LobbyStack. A direct business has none; it pays the host on its plan page.
 */
export async function getPackageBilling(context: DomainContext, input: { userId: string; businessId: string }): Promise<PackageBillingPage> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireTeamAdmin(tx, input);
    const [business] = await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business?.partnerId) throw businessNotFound();
    const account = await readAccount(tx, input.businessId);
    if (!context.stripeConnect || !account?.packageId) return { billing: "outside" };
    // The business's own operators read the one package its billing account names.
    const [pkg] = await tx.select().from(partnerPackages).where(eq(partnerPackages.id, account.packageId)).limit(1);
    if (!pkg) return { billing: "outside" };
    const live = hasLivePackageSubscription(account.stripeSubscriptionState);
    return {
      billing: "package",
      offer: offerFrom(pkg, account),
      currentPeriodEnd: account.stripeCurrentPeriodEnd?.toISOString() ?? null,
      canOpenPortal: Boolean(account.stripeCustomerId && account.stripeAccountId),
      canSubscribe: !live && !pkg.archivedAt,
    };
  });
}

/**
 * A link to the partner's Stripe customer portal for the business, where its
 * owner updates the card, sees each invoice and cancels. Owners and admins
 * can, once the business has paid on an account the deployment still reaches.
 */
export async function openPackagePortal(context: DomainContext, input: { userId: string; businessId: string; returnUrl: string }): Promise<{ url: string }> {
  const stripe = context.stripeConnect;
  if (!stripe) throw notConfigured();
  const target = await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireTeamAdmin(tx, input);
    const account = await readAccount(tx, input.businessId);
    if (!account?.stripeCustomerId || !account.stripeAccountId) throw failure("This business hasn't paid through Stripe yet.", 409, "no_customer");
    return { accountId: account.stripeAccountId, customerId: account.stripeCustomerId };
  });
  const reachable = await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "system" }, async (tx) => {
    const partnerId = await businessPartner(tx, input.businessId);
    const partnerAccount = partnerId ? await readPartnerAccount(tx, partnerId) : null;
    return Boolean(partnerAccount && !partnerAccount.disconnectedAt && partnerAccount.stripeAccountId === target.accountId);
  });
  if (!reachable) throw paymentsUnavailable();
  try {
    return await stripe.createPortal(target.accountId, target.customerId, input.returnUrl);
  } catch {
    // Most often the partner hasn't saved its customer portal settings in Stripe yet.
    throw failure("The customer portal isn't available right now.", 409, "portal_unavailable");
  }
}

/** The Connect events that change a business's subscription. Each names the subscription, which the webhook reads back from Stripe. */
const SUBSCRIPTION_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

/** Whether the Connect webhook reconciles this event into a business's billing account. */
export function isPackageSubscriptionEvent(event: StripeConnectEvent): event is StripeConnectEvent & { accountId: string; subscriptionId: string } {
  return SUBSCRIPTION_EVENT_TYPES.has(event.type) && Boolean(event.accountId && event.subscriptionId);
}

export type PackageSubscriptionOutcome = {
  duplicate: boolean;
  applied: boolean;
  /** The partner whose account the event is on, or null when no partner has it. */
  partnerId: string | null;
  /** The business whose billing account the event is about, or null when it names none of that partner's. */
  businessId: string | null;
  /** The subscription pays for a package the business isn't on, so it changed nothing. */
  otherPackage?: boolean;
};

function isNotFound(error: unknown): boolean {
  return (error as { statusCode?: unknown } | null)?.statusCode === 404;
}

/**
 * Applies what Stripe says of a business's subscription now to its billing
 * account, and reports whether it changed anything. A subscription counts
 * only for the package its checkout sold, which its metadata names: one for
 * a package the business has since left never makes it live, though the
 * one it tracks still records ending. A business tracks one subscription:
 * another one replaces it only when it's live and the current one isn't, so
 * an older subscription ending never ends the current one. A read that
 * started before the one already applied changes nothing. The transaction
 * acts as the system actor, scoped to the business.
 */
async function reconcilePackageSubscriptionIn(
  tx: DatabaseTransaction,
  input: { businessId: string; partnerId: string; accountId: string; subscription: StripeConnectSubscription; observedAt: Date },
): Promise<"applied" | "unchanged" | "other_package"> {
  const { subscription, observedAt } = input;
  await lockBusinessBillingAccount(tx, input.businessId);
  const account = await readAccount(tx, input.businessId);
  const live = hasLivePackageSubscription(subscription.status);
  const same = account?.stripeSubscriptionId === subscription.subscriptionId;
  const forPackage = Boolean(account?.packageId) && subscription.metadata.lobbystack_package_id === account?.packageId;
  if (!forPackage && (live || !same)) return "other_package";
  if (account?.stripeSubscriptionId && !same) {
    // A subscription on an account the partner disconnected can't be reached any more, so a live one on its new account replaces it.
    const currentLive = hasLivePackageSubscription(account.stripeSubscriptionState) && account.stripeAccountId === input.accountId;
    if (!live || currentLive) return "unchanged";
  }
  if (same && account?.stripeSyncedAt && account.stripeSyncedAt > observedAt) return "unchanged";
  const values = {
    stripeAccountId: input.accountId,
    stripeCustomerId: subscription.customerId || account?.stripeCustomerId || null,
    stripeSubscriptionId: subscription.subscriptionId,
    stripeSubscriptionState: subscription.status.slice(0, 32),
    stripeCurrentPeriodEnd: subscription.currentPeriodEnd,
    stripeSyncedAt: observedAt,
    // A paid checkout has done its job.
    ...(live ? NO_CHECKOUT : {}),
  };
  await tx.insert(billingAccounts).values({ businessId: input.businessId, billingKey: `business:${input.businessId}`, ...values })
    .onConflictDoUpdate({ target: billingAccounts.businessId, set: { ...values, updatedAt: new Date() } });
  const wasLive = same && hasLivePackageSubscription(account?.stripeSubscriptionState);
  if (live && !wasLive && account?.packageId) {
    const [pkg] = await tx.select({ currency: partnerPackages.currency }).from(partnerPackages).where(eq(partnerPackages.id, account.packageId)).limit(1);
    await recordProductEventInTransaction(tx, {
      name: "billing.package_subscription_started",
      distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
      businessId: input.businessId,
      actorType: "system",
      properties: { partnerId: input.partnerId, packageId: account.packageId, currency: pkg?.currency ?? "unknown" },
    });
  }
  // The dashboard's billing page and usage refresh from this.
  await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "billing_account", aggregateId: input.businessId, dedupeKey: `billing:${input.businessId}:package:${subscription.subscriptionId}:${observedAt.getTime()}`, payload: { type: "billing.updated", entityId: input.businessId } });
  return "applied";
}

/**
 * Records a verified Connect event about a business's subscription once, and
 * reconciles the business's billing account from the subscription as Stripe
 * describes it now, which also settles events that arrive out of order. The
 * subscription names its business in the metadata its checkout set, and the
 * business must belong to the partner whose account the event is on. Stripe
 * not answering throws, so the webhook asks Stripe to deliver it again.
 */
export async function reconcilePackageSubscription(
  context: DomainContext,
  event: StripeConnectEvent & { accountId: string; subscriptionId: string },
): Promise<PackageSubscriptionOutcome> {
  const seen = await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => (await tx.select({ id: providerEvents.id }).from(providerEvents).where(and(eq(providerEvents.provider, "stripe"), eq(providerEvents.providerEventId, event.id))).limit(1)).length > 0);
  if (seen) return { duplicate: true, applied: false, partnerId: null, businessId: null };
  let subscription: StripeConnectSubscription | null = null;
  // Taken before asking, so a read that started earlier but answered later never overwrites one that started after it.
  const observedAt = new Date();
  if (context.stripeConnect) {
    try {
      subscription = await context.stripeConnect.retrieveSubscription(event.accountId, event.subscriptionId);
    } catch (error) {
      // No such subscription on that account: nothing of ours to reconcile.
      if (!isNotFound(error)) throw error;
    }
  }
  const named = subscription?.metadata.lobbystack_business_id;
  const businessId = isUuid(named) ? named.toLowerCase() : null;
  return await withBusinessTransaction(context.db, { actorType: "system", ...(businessId ? { businessId } : {}) }, async (tx) => {
    const [owner] = await tx.select({ partnerId: partnerStripeAccounts.partnerId }).from(partnerStripeAccounts).where(eq(partnerStripeAccounts.stripeAccountId, event.accountId)).limit(1);
    const partnerId = owner?.partnerId ?? null;
    const ours = Boolean(businessId && partnerId && await businessPartner(tx, businessId) === partnerId);
    const payload = {
      accountId: event.accountId,
      createdAt: event.createdAt.toISOString(),
      subscriptionId: event.subscriptionId,
      ...(subscription ? { subscription: { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null } } : {}),
    };
    const [stored] = await tx.insert(providerEvents).values({ provider: "stripe", providerEventId: event.id, eventType: event.type, businessId: ours ? businessId : null, payload }).onConflictDoNothing().returning({ id: providerEvents.id });
    if (!stored) return { duplicate: true, applied: false, partnerId: null, businessId: null };
    const result = ours && subscription ? await reconcilePackageSubscriptionIn(tx, { businessId: businessId!, partnerId: partnerId!, accountId: event.accountId, subscription, observedAt }) : "unchanged";
    const applied = result === "applied";
    await tx.update(providerEvents).set({ status: applied ? "processed" : "ignored", updatedAt: new Date() }).where(eq(providerEvents.id, stored.id));
    return { duplicate: false, applied, partnerId, businessId: ours ? businessId : null, ...(result === "other_package" ? { otherPackage: true } : {}) };
  });
}
