import { randomUUID } from "node:crypto";

import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { partnerPackages, partnerStripeAccounts, providerEvents, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import type { PackageTerms, StripeConnectAccount, StripeConnectEvent } from "@lobbystack/providers";
import { isPackageAllowance, isPackageAmount, isStripeAccountCountry, normalizePackageName, partnerStripeStatus, type PartnerRole, type PartnerStripeStatus } from "@lobbystack/shared";

import { AuthorizationError } from "../authz";
import type { DomainContext } from "./context";
import { isPackageSubscriptionEvent, reconcilePackageSubscription } from "./packageBilling";
import { actorUserId, partnerActorRole, partnerRls, requirePartnerOwner } from "./partnerActors";
import type { PartnerActor } from "./partners";

// A partner's Stripe connection and the packages it sells (ADR 0009). The
// partner connects its own Stripe account, and each package's product and
// prices live on that account, so its businesses pay the partner directly
// and the host never holds their money. Only owners connect Stripe; owners
// and admins manage packages; members see neither. Stripe itself comes in
// as context.stripeConnect, which a deployment without Stripe Connect leaves
// out: its partners' businesses are all billed outside LobbyStack.

/** A partner's Stripe connection as the console's Stripe page shows it. */
export type PartnerStripeConnection = {
  /** Whether this deployment has Stripe Connect set up at all. */
  configured: boolean;
  status: PartnerStripeStatus;
  accountId: string | null;
  country: string | null;
  /** The currency the partner's packages are priced in. */
  currency: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  disconnectedAt: string | null;
};

/** A package as the console's Packages page shows it. Amounts are in the currency's smallest unit. */
export type PartnerPackage = {
  packageId: string;
  name: string;
  currency: string;
  monthlyPriceMinor: number;
  setupFeeMinor: number | null;
  allowance: { voiceMinutes: number; chats: number };
  /** Whether its prices live on the partner's connected account. One made on an account the partner since disconnected can't sell. */
  onConnectedAccount: boolean;
  createdAt: string;
};

export type PartnerPackages = {
  /** The actor's own role, read with the packages. */
  role: PartnerRole;
  /** Whether new packages can be made now, and in which currency. */
  stripe: { configured: boolean; status: PartnerStripeStatus; currency: string | null };
  packages: PartnerPackage[];
};

export type PartnerPackageInput = { name: unknown; monthlyPriceMinor: unknown; setupFeeMinor: unknown; voiceMinutes: unknown; chats: unknown };

type AccountRow = typeof partnerStripeAccounts.$inferSelect;
type PackageRow = typeof partnerPackages.$inferSelect;

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

const notConfigured = () => failure("Stripe Connect isn't set up on this deployment.", 409, "stripe_not_configured");
const notConnected = () => failure("Connect your Stripe account before you sell packages.", 409, "stripe_not_connected");
const packageNotFound = () => failure("Package not found.", 404, "package_not_found");

/** A key acts on the partner too, with an admin's rights. */
function memberActor(actor: PartnerActor): PartnerActor {
  return actor;
}

/** The actor's role as the database has it now, which may differ from the one it arrived with. */
async function readRole(tx: DatabaseTransaction, actor: PartnerActor): Promise<PartnerRole> {
  return await partnerActorRole(tx, actor);
}

/** Only owners manage the Stripe connection, and keys an owner granted the billing scope. */
async function requireOwner(tx: DatabaseTransaction, actor: PartnerActor, scope: "partner.billing:read" | "partner.billing:write"): Promise<void> {
  await requirePartnerOwner(tx, actor, { scope, message: "Only owners can manage the Stripe connection." });
}

async function requireManager(tx: DatabaseTransaction, actor: PartnerActor): Promise<PartnerRole> {
  const role = await readRole(tx, actor);
  if (role === "member") throw new AuthorizationError("Only owners and admins can manage packages.");
  return role;
}

async function readAccount(tx: DatabaseTransaction, partnerId: string): Promise<AccountRow | null> {
  return (await tx.select().from(partnerStripeAccounts).where(eq(partnerStripeAccounts.partnerId, partnerId)).limit(1))[0] ?? null;
}

function connectionFrom(row: AccountRow | null, configured: boolean): PartnerStripeConnection {
  return {
    configured,
    status: partnerStripeStatus(row),
    accountId: row?.stripeAccountId ?? null,
    country: row?.country ?? null,
    currency: row?.currency ?? null,
    detailsSubmitted: row?.detailsSubmitted ?? false,
    chargesEnabled: row?.chargesEnabled ?? false,
    payoutsEnabled: row?.payoutsEnabled ?? false,
    disconnectedAt: row?.disconnectedAt?.toISOString() ?? null,
  };
}

/**
 * Writes what Stripe says of a connected account, unless the account was
 * disconnected or the deployment already holds newer news of it. Returns
 * the partner the account belongs to when it wrote anything. The caller acts
 * as the system actor.
 */
async function applyAccountIn(tx: DatabaseTransaction, account: StripeConnectAccount, observedAt: Date): Promise<string | null> {
  const [applied] = await tx.update(partnerStripeAccounts).set({
    // Stripe always names both; keep what's known if it ever doesn't.
    country: account.country ?? sql`${partnerStripeAccounts.country}`,
    currency: account.currency ?? sql`${partnerStripeAccounts.currency}`,
    detailsSubmitted: account.detailsSubmitted,
    chargesEnabled: account.chargesEnabled,
    payoutsEnabled: account.payoutsEnabled,
    disabledReason: account.disabledReason?.slice(0, 120) ?? null,
    syncedAt: observedAt,
    updatedAt: new Date(),
  }).where(and(
    eq(partnerStripeAccounts.stripeAccountId, account.accountId),
    isNull(partnerStripeAccounts.disconnectedAt),
    or(isNull(partnerStripeAccounts.syncedAt), lte(partnerStripeAccounts.syncedAt, observedAt)),
  )).returning({ partnerId: partnerStripeAccounts.partnerId });
  return applied?.partnerId ?? null;
}

/** Marks a connected account disconnected. It can't take payments for the deployment from then on. */
async function disconnectIn(tx: DatabaseTransaction, accountId: string, at: Date): Promise<string | null> {
  const [disconnected] = await tx.update(partnerStripeAccounts).set({ disconnectedAt: at, chargesEnabled: false, payoutsEnabled: false, syncedAt: at, updatedAt: new Date() })
    .where(and(eq(partnerStripeAccounts.stripeAccountId, accountId), isNull(partnerStripeAccounts.disconnectedAt)))
    .returning({ partnerId: partnerStripeAccounts.partnerId });
  return disconnected?.partnerId ?? null;
}

/**
 * The partner's Stripe connection. Only owners can see it. With refresh, as
 * when the owner comes back from Stripe's onboarding, it asks Stripe for the
 * account first rather than wait for the webhook; if Stripe can't answer, it
 * shows what it already knows.
 */
export async function getPartnerStripeConnection(context: DomainContext, actor: PartnerActor, options: { refresh?: boolean } = {}): Promise<PartnerStripeConnection> {
  const member = memberActor(actor);
  const read = async () => await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await requireOwner(tx, member, "partner.billing:read");
    return await readAccount(tx, member.partnerId);
  });
  const row = await read();
  const stripe = context.stripeConnect ?? null;
  if (!options.refresh || !stripe || !row || row.disconnectedAt) return connectionFrom(row, Boolean(stripe));
  let account: StripeConnectAccount;
  try {
    account = await stripe.retrieveAccount(row.stripeAccountId);
  } catch {
    // The Connect webhook brings the same news once Stripe is back.
    return connectionFrom(row, true);
  }
  const observedAt = new Date();
  await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => await applyAccountIn(tx, account, observedAt));
  return connectionFrom(await read(), true);
}

/**
 * Starts or resumes Stripe's onboarding for the partner's account and returns
 * the link to send the owner to. A partner with no account, or whose account
 * disconnected, gets a new one in the country the owner chose; Stripe fixes
 * an account's country when it creates it. Only owners can.
 */
export async function startPartnerStripeOnboarding(
  context: DomainContext,
  actor: PartnerActor,
  input: { country: string | null; returnUrl: string; refreshUrl: string },
): Promise<{ url: string; accountId: string }> {
  const member = memberActor(actor);
  const stripe = context.stripeConnect;
  if (!stripe) throw notConfigured();
  const existing = await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await requireOwner(tx, member, "partner.billing:write");
    return await readAccount(tx, member.partnerId);
  });
  const link = (accountId: string | null, country: string | null) => stripe.createOnboardingLink({
    accountId,
    country,
    // A new account after each disconnection, and the same one for a repeated click.
    idempotencyKey: `partner-stripe-account:${member.partnerId}:${existing?.stripeAccountId ?? "first"}:${country ?? ""}`,
    returnUrl: input.returnUrl,
    refreshUrl: input.refreshUrl,
    metadata: { lobbystack_partner_id: member.partnerId },
  });
  if (existing && !existing.disconnectedAt) return await link(existing.stripeAccountId, null);

  const country = input.country;
  if (!isStripeAccountCountry(country)) throw failure("Choose the country your business is in.", 400, "invalid_country");
  const created = await link(null, country);
  const recorded = await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "system" }, async (tx) => {
    const fresh = { stripeAccountId: created.accountId, country, currency: null, detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, disabledReason: null, disconnectedAt: null, syncedAt: null, connectedByUserId: actorUserId(member) };
    const [saved] = existing
      // Only the disconnected account it read gives way, so two owners reconnecting at once keep one account.
      ? await tx.update(partnerStripeAccounts).set({ ...fresh, updatedAt: new Date() }).where(and(eq(partnerStripeAccounts.partnerId, member.partnerId), eq(partnerStripeAccounts.stripeAccountId, existing.stripeAccountId), isNotNull(partnerStripeAccounts.disconnectedAt))).returning({ accountId: partnerStripeAccounts.stripeAccountId })
      : await tx.insert(partnerStripeAccounts).values({ partnerId: member.partnerId, ...fresh }).onConflictDoNothing().returning({ accountId: partnerStripeAccounts.stripeAccountId });
    return saved?.accountId ?? (await readAccount(tx, member.partnerId))?.stripeAccountId ?? null;
  });
  if (recorded === created.accountId) return created;
  // Another owner connected an account first, so this one continues onboarding that account.
  if (!recorded) throw failure("Someone else changed the Stripe connection. Refresh and try again.", 409, "stripe_connection_changed");
  return await link(recorded, null);
}

/** What the deployment keeps of a Connect event: the account it names and what it said, and nothing else the account holds. */
function storedPayload(event: StripeConnectEvent): Record<string, unknown> {
  return { accountId: event.accountId, createdAt: event.createdAt.toISOString(), ...(event.account ? { account: event.account } : {}) };
}

export type StripeConnectEventOutcome = {
  /** Stripe sent this event before, so nothing happened this time. */
  duplicate: boolean;
  /** Whether the event changed what the deployment knows of an account or a business's subscription. */
  applied: boolean;
  /** The partner whose account the event is about, or null when no partner has that account. */
  partnerId: string | null;
  /** For a subscription event, the business it's about, or null when it names none of that partner's. */
  businessId?: string | null;
  /** For a subscription event, whether the subscription pays for a package the business isn't on, so it changed nothing. */
  otherPackage?: boolean;
};

/**
 * Records a verified event from the Connect webhook once, and applies it.
 * account.updated writes what Stripe now says of the account, unless the
 * deployment holds newer news, and account.application.deauthorized marks it
 * disconnected. Account events name no business, so they apply here instead
 * of through the worker's reconcile. Checkout, subscription and invoice
 * events reconcile the business's subscription, which reconcilePackageSubscription
 * reads back from Stripe. Other events are kept and ignored.
 */
export async function recordStripeConnectEvent(context: DomainContext, event: StripeConnectEvent): Promise<StripeConnectEventOutcome> {
  if (isPackageSubscriptionEvent(event)) return await reconcilePackageSubscription(context, event);
  return await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => {
    const [stored] = await tx.insert(providerEvents).values({ provider: "stripe", providerEventId: event.id, eventType: event.type, payload: storedPayload(event) }).onConflictDoNothing().returning({ id: providerEvents.id });
    if (!stored) return { duplicate: true, applied: false, partnerId: null };
    let applied: string | null = null;
    if (event.type === "account.updated" && event.account) applied = await applyAccountIn(tx, event.account, event.createdAt);
    if (event.type === "account.application.deauthorized" && event.accountId) applied = await disconnectIn(tx, event.accountId, event.createdAt);
    await tx.update(providerEvents).set({ status: applied ? "processed" : "ignored", updatedAt: new Date() }).where(eq(providerEvents.id, stored.id));
    const partnerId = applied ?? (event.accountId
      ? (await tx.select({ partnerId: partnerStripeAccounts.partnerId }).from(partnerStripeAccounts).where(eq(partnerStripeAccounts.stripeAccountId, event.accountId)).limit(1))[0]?.partnerId ?? null
      : null);
    return { duplicate: false, applied: Boolean(applied), partnerId };
  });
}

function packageFrom(row: PackageRow, account: AccountRow | null): PartnerPackage {
  return {
    packageId: row.id,
    name: row.name,
    currency: row.currency,
    monthlyPriceMinor: row.monthlyPriceMinor,
    setupFeeMinor: row.setupFeeMinor,
    allowance: { voiceMinutes: row.voiceMinutes, chats: row.chats },
    onConnectedAccount: Boolean(account && !account.disconnectedAt && account.stripeAccountId === row.stripeAccountId),
    createdAt: row.createdAt.toISOString(),
  };
}

function termsOf(row: PackageRow, change: { name: string; active: boolean }): PackageTerms {
  return {
    packageId: row.id,
    name: change.name,
    currency: row.currency,
    monthlyPriceMinor: row.monthlyPriceMinor,
    setupFeeMinor: row.setupFeeMinor,
    active: change.active,
    prices: { productId: row.stripeProductId, priceId: row.stripePriceId, setupPriceId: row.stripeSetupPriceId },
  };
}

/** The partner's packages still for sale, oldest first, with whether new ones can be made. Owners and admins can read them. */
export async function listPartnerPackages(context: DomainContext, actor: PartnerActor): Promise<PartnerPackages> {
  const member = memberActor(actor);
  return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    const role = await requireManager(tx, member);
    const account = await readAccount(tx, member.partnerId);
    const rows = await tx.select().from(partnerPackages).where(and(eq(partnerPackages.partnerId, member.partnerId), isNull(partnerPackages.archivedAt))).orderBy(asc(partnerPackages.createdAt), asc(partnerPackages.id));
    return {
      role,
      stripe: { configured: Boolean(context.stripeConnect), status: partnerStripeStatus(account), currency: account && !account.disconnectedAt ? account.currency : null },
      packages: rows.map((row) => packageFrom(row, account)),
    };
  });
}

/** Whether a database error is the package trigger refusing an account the partner no longer has. */
function isAccountMismatch(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; current = (current as { cause?: unknown }).cause, depth += 1) {
    if ((current as { message?: unknown }).message === "package_account_mismatch") return true;
  }
  return false;
}

/**
 * Makes a package: a name, a monthly price, an optional setup fee and a
 * monthly allowance of minutes and chats, in the connected account's
 * currency. Its product and prices are created on that account first, so a
 * business that buys it pays the partner. Owners and admins can, once the
 * partner has connected Stripe.
 */
export async function createPartnerPackage(context: DomainContext, actor: PartnerActor, input: PartnerPackageInput): Promise<PartnerPackage> {
  const member = memberActor(actor);
  const name = normalizePackageName(input.name);
  if (!name) throw failure("Enter the package's name, up to 80 characters.", 400, "invalid_name");
  if (!isPackageAmount(input.monthlyPriceMinor)) throw failure("Enter a monthly price above zero.", 400, "invalid_price");
  const setupFeeMinor = input.setupFeeMinor === null || input.setupFeeMinor === undefined || input.setupFeeMinor === 0 ? null : input.setupFeeMinor;
  if (setupFeeMinor !== null && !isPackageAmount(setupFeeMinor)) throw failure("Enter a setup fee above zero, or leave it empty.", 400, "invalid_setup_fee");
  if (!isPackageAllowance(input.voiceMinutes) || !isPackageAllowance(input.chats)) throw failure("Enter the minutes and chats as whole numbers from 0 to 1,000,000.", 400, "invalid_allowance");
  const terms = { name, monthlyPriceMinor: input.monthlyPriceMinor, setupFeeMinor, voiceMinutes: input.voiceMinutes, chats: input.chats };

  const account = await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await requireManager(tx, member);
    return await readAccount(tx, member.partnerId);
  });
  const stripe = context.stripeConnect;
  if (!stripe) throw notConfigured();
  if (!account || account.disconnectedAt || !account.currency) throw notConnected();
  const packageId = randomUUID();
  const prices = await stripe.upsertPackagePrice(account.stripeAccountId, { packageId, name, currency: account.currency, monthlyPriceMinor: terms.monthlyPriceMinor, setupFeeMinor, active: true, prices: null });
  try {
    return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
      await requireManager(tx, member);
      const [row] = await tx.insert(partnerPackages).values({
        id: packageId,
        partnerId: member.partnerId,
        ...terms,
        currency: account.currency!,
        stripeAccountId: account.stripeAccountId,
        stripeProductId: prices.productId,
        stripePriceId: prices.priceId,
        stripeSetupPriceId: prices.setupPriceId,
        createdByUserId: actorUserId(member),
      }).returning();
      return packageFrom(row!, account);
    });
  } catch (error) {
    // The partner disconnected or changed its account while Stripe made the prices.
    if (isAccountMismatch(error)) throw notConnected();
    throw error;
  }
}

/** A package still for sale, with the partner's account, for an owner or admin. */
async function readPackageForChange(context: DomainContext, member: PartnerActor, packageId: string): Promise<{ row: PackageRow; account: AccountRow | null }> {
  return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await requireManager(tx, member);
    const [row] = await tx.select().from(partnerPackages).where(and(eq(partnerPackages.id, packageId), eq(partnerPackages.partnerId, member.partnerId), isNull(partnerPackages.archivedAt))).limit(1);
    if (!row) throw packageNotFound();
    return { row, account: await readAccount(tx, member.partnerId) };
  });
}

async function updatePackage(context: DomainContext, member: PartnerActor, packageId: string, change: Partial<Pick<PackageRow, "name" | "archivedAt">>): Promise<PackageRow> {
  return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await requireManager(tx, member);
    const [row] = await tx.update(partnerPackages).set({ ...change, updatedAt: new Date() }).where(and(eq(partnerPackages.id, packageId), eq(partnerPackages.partnerId, member.partnerId), isNull(partnerPackages.archivedAt))).returning();
    if (!row) throw packageNotFound();
    return row;
  });
}

/**
 * Renames a package, on Stripe too, where its invoices take the name. Its
 * price and allowance stay as they are, since businesses may already pay
 * them. Owners and admins can, while the package is on the connected account.
 */
export async function renamePartnerPackage(context: DomainContext, actor: PartnerActor, input: { packageId: string; name: unknown }): Promise<PartnerPackage> {
  const member = memberActor(actor);
  const name = normalizePackageName(input.name);
  if (!name) throw failure("Enter the package's name, up to 80 characters.", 400, "invalid_name");
  const { row, account } = await readPackageForChange(context, member, input.packageId);
  const stripe = context.stripeConnect;
  if (!stripe) throw notConfigured();
  if (!packageFrom(row, account).onConnectedAccount) throw notConnected();
  await stripe.upsertPackagePrice(row.stripeAccountId, termsOf(row, { name, active: true }));
  return packageFrom(await updatePackage(context, member, row.id, { name }), account);
}

/**
 * Stops selling a package. Its prices stop selling on Stripe too, when the
 * deployment can still reach the account. Businesses already on it keep it.
 * Owners and admins can.
 */
export async function archivePartnerPackage(context: DomainContext, actor: PartnerActor, input: { packageId: string }): Promise<void> {
  const member = memberActor(actor);
  const { row, account } = await readPackageForChange(context, member, input.packageId);
  const stripe = context.stripeConnect;
  // A disconnected account, or a deployment that turned Stripe Connect off, can't sell it anyway.
  if (stripe && packageFrom(row, account).onConnectedAccount) await stripe.upsertPackagePrice(row.stripeAccountId, termsOf(row, { name: row.name, active: false }));
  await updatePackage(context, member, row.id, { archivedAt: new Date() });
}

