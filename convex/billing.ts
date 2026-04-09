import { Polar as ConvexPolar, type PolarWebhookEvent } from "@convex-dev/polar";
import { Polar as PolarSdk } from "@polar-sh/sdk";
import { type HttpRouter } from "convex/server";
import { v } from "convex/values";

import {
  billingDefaults,
  billingMeterEventNames,
  type BillingStatus,
  type BillingTier,
  type BillingTransactionKind,
  type BillingTransactionSummary,
  type BillingUsageKind,
} from "../packages/shared/src/billing";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  deriveBillingTier,
  getBillingAccount,
  getBillingIncludedUsage,
  getBillingKey,
  getBillingSnapshot,
  getBillingUsageSnapshotData,
} from "./lib/billing";
import { requireCurrentUser, requireMembership } from "./lib/auth";

type BillingContact = {
  email: string | null;
  name: string | null;
};

type CheckoutContext = {
  billingKey: string;
  billingContactEmail: string | null;
  billingContactName: string | null;
  polarCustomerId: string | null;
  polarCustomerExternalId: string | null;
};

type RecordUsageEventResult = {
  usageEventId: Id<"billing_usage_events">;
  tier: BillingTier;
  syncNeeded: boolean;
};

type SendBillingUsagePayload = {
  businessId: Id<"businesses">;
  billingKey: string;
  usageKind: BillingUsageKind;
  quantity: number;
  sourceKey: string;
  recordedAt: string;
};

function getPolarServer(): "sandbox" | "production" {
  return process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

function createPolarClient(): PolarSdk {
  const accessToken = process.env.POLAR_ORGANIZATION_TOKEN?.trim();
  if (!accessToken) {
    throw new Error("POLAR_ORGANIZATION_TOKEN is required.");
  }

  return new PolarSdk({
    accessToken,
    server: getPolarServer(),
  });
}

function getBillingSiteUrl(): URL {
  const rawSiteUrl = process.env.SITE_URL?.trim();
  if (!rawSiteUrl) {
    throw new Error("SITE_URL is required for Polar checkout.");
  }

  return new URL(rawSiteUrl);
}

function getPaidProductId(): string {
  const productId = process.env.POLAR_PAID_PRODUCT_ID?.trim();
  if (!productId) {
    throw new Error("POLAR_PAID_PRODUCT_ID is required.");
  }
  return productId;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown billing error.";
}

function parseBusinessIdFromBillingKey(
  billingKey: string | null | undefined,
): Id<"businesses"> | null {
  if (!billingKey || !billingKey.startsWith("business:")) {
    return null;
  }

  return billingKey.slice("business:".length) as Id<"businesses">;
}

async function findBillingContactForRole(
  ctx: QueryCtx,
  args: {
    businessId: Id<"businesses">;
    role: string;
  },
): Promise<BillingContact | null> {
  const memberships = await ctx.db
    .query("business_memberships")
    .withIndex("by_business_id_and_role", (q) =>
      q.eq("businessId", args.businessId).eq("role", args.role),
    )
    .collect();

  for (const membership of memberships) {
    if (membership.status !== "active") {
      continue;
    }

    const user = await ctx.db.get(membership.userId);
    if (!user?.email) {
      continue;
    }

    return {
      email: user.email,
      name: user.displayName ?? user.name ?? null,
    };
  }

  return null;
}

async function resolveBillingContact(
  ctx: QueryCtx,
  args: {
    businessId: Id<"businesses">;
    currentUser: Doc<"users">;
    account: Doc<"billing_accounts"> | null;
  },
): Promise<BillingContact> {
  if (args.account?.billingContactEmail) {
    return {
      email: args.account.billingContactEmail,
      name: args.account.billingContactName ?? null,
    };
  }

  const owner = await findBillingContactForRole(ctx, {
    businessId: args.businessId,
    role: "business_owner",
  });
  if (owner) {
    return owner;
  }

  const admin = await findBillingContactForRole(ctx, {
    businessId: args.businessId,
    role: "business_admin",
  });
  if (admin) {
    return admin;
  }

  return {
    email: args.currentUser.email ?? null,
    name: args.currentUser.displayName ?? args.currentUser.name ?? null,
  };
}

function buildBillingStatus(input: {
  billingKey: string;
  tier: BillingTier;
  subscriptionState: string;
  contact: BillingContact;
  usage: Doc<"billing_usage_months"> | null;
  periodKey: string;
  recentTransactions: Array<BillingTransactionSummary>;
  hasCustomerPortalAccess: boolean;
  hasCheckoutAccess: boolean;
}): BillingStatus {
  const usage = getBillingUsageSnapshotData({
    tier: input.tier,
    periodKey: input.periodKey,
    usage: input.usage,
  });

  return {
    tier: input.tier,
    billingKey: input.billingKey,
    subscriptionState: input.subscriptionState,
    minimumMonthlyChargeCents:
      input.tier === "paid_monthly" || input.hasCheckoutAccess
        ? billingDefaults.paidMonthlyMinimumChargeCents
        : null,
    billingContactEmail: input.contact.email,
    billingContactName: input.contact.name,
    hasCustomerPortalAccess: input.hasCustomerPortalAccess,
    hasCheckoutAccess: input.hasCheckoutAccess,
    usage,
    recentTransactions: input.recentTransactions,
  };
}

const billingPolar = new ConvexPolar(components.polar, {
  getUserInfo: async () => ({
    userId: "",
    email: "",
  }),
  server: getPolarServer(),
});

export function registerBillingRoutes(http: HttpRouter): void {
  billingPolar.registerRoutes(http as any, {
    events: {
      "subscription.created": async (ctx, event) => {
        await syncSubscriptionFromWebhookEvent(ctx, event);
      },
      "subscription.updated": async (ctx, event) => {
        await syncSubscriptionFromWebhookEvent(ctx, event);
      },
      "subscription.active": async (ctx, event) => {
        await syncSubscriptionFromWebhookEvent(ctx, event);
      },
      "subscription.canceled": async (ctx, event) => {
        await syncSubscriptionFromWebhookEvent(ctx, event);
      },
      "subscription.past_due": async (ctx, event) => {
        await syncSubscriptionFromWebhookEvent(ctx, event);
      },
      "subscription.revoked": async (ctx, event) => {
        await syncSubscriptionFromWebhookEvent(ctx, event);
      },
      "subscription.uncanceled": async (ctx, event) => {
        await syncSubscriptionFromWebhookEvent(ctx, event);
      },
      "order.created": async (ctx, event) => {
        await syncOrderTransactionFromWebhookEvent(ctx, event);
      },
      "order.paid": async (ctx, event) => {
        await syncOrderTransactionFromWebhookEvent(ctx, event);
      },
      "order.refunded": async (ctx, event) => {
        await syncOrderTransactionFromWebhookEvent(ctx, event);
      },
      "refund.created": async (ctx, event) => {
        await syncRefundTransactionFromWebhookEvent(ctx, event);
      },
      "refund.updated": async (ctx, event) => {
        await syncRefundTransactionFromWebhookEvent(ctx, event);
      },
    },
  });
}

async function syncSubscriptionFromWebhookEvent(
  ctx: Pick<MutationCtx, "runMutation">,
  event: Extract<
    PolarWebhookEvent,
    {
      type:
        | "subscription.created"
        | "subscription.updated"
        | "subscription.active"
        | "subscription.canceled"
        | "subscription.past_due"
        | "subscription.revoked"
        | "subscription.uncanceled";
    }
  >,
): Promise<void> {
  const billingKey = event.data.customer.externalId ?? null;
  const businessId = parseBusinessIdFromBillingKey(billingKey);
  if (!businessId || !billingKey) {
    return;
  }

  await ctx.runMutation(internal.billing.syncSubscriptionFromWebhook, {
    businessId,
    billingKey,
    polarCustomerId: event.data.customerId,
    polarCustomerExternalId: billingKey,
    ...(event.data.customer.email
      ? { billingContactEmail: event.data.customer.email }
      : {}),
    ...(event.data.customer.name
      ? { billingContactName: event.data.customer.name }
      : {}),
    subscriptionId: event.data.id,
    subscriptionProductId: event.data.productId,
    ...(event.data.prices[0]?.id
      ? { subscriptionPriceId: event.data.prices[0].id }
      : {}),
    subscriptionState: event.data.status,
    currentPeriodStart: event.data.currentPeriodStart.toISOString(),
    currentPeriodEnd: event.data.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: event.data.cancelAtPeriodEnd,
    ...(event.data.checkoutId ? { checkoutId: event.data.checkoutId } : {}),
    lastWebhookEventType: event.type,
    lastSyncedAt: event.timestamp.toISOString(),
  });
}

async function syncOrderTransactionFromWebhookEvent(
  ctx: Pick<MutationCtx, "runMutation">,
  event: Extract<
    PolarWebhookEvent,
    {
      type: "order.created" | "order.paid" | "order.refunded";
    }
  >,
): Promise<void> {
  const businessId =
    parseBusinessIdFromBillingKey(event.data.customer.externalId ?? null) ??
    (typeof event.data.metadata.businessId === "string"
      ? (event.data.metadata.businessId as Id<"businesses">)
      : null);
  if (!businessId) {
    return;
  }

  let invoiceUrl: string | undefined;
  if (event.data.isInvoiceGenerated) {
    try {
      const invoice = await createPolarClient().orders.invoice({ id: event.data.id });
      invoiceUrl = invoice.url;
    } catch {
      invoiceUrl = undefined;
    }
  }

  await ctx.runMutation(internal.billing.upsertTransactionFromWebhook, {
    businessId,
    kind: "order",
    sourceId: event.data.id,
    status: event.data.status,
    amountCents: event.data.totalAmount,
    currency: event.data.currency,
    description: event.data.description,
    ...(invoiceUrl ? { invoiceUrl } : {}),
    ...(event.data.subscriptionId ? { subscriptionId: event.data.subscriptionId } : {}),
    ...(event.data.customerId ? { polarCustomerId: event.data.customerId } : {}),
    orderId: event.data.id,
    occurredAt: event.data.createdAt.toISOString(),
    lastSyncedAt: event.timestamp.toISOString(),
  });
}

async function syncRefundTransactionFromWebhookEvent(
  ctx: Pick<MutationCtx, "runMutation">,
  event: Extract<
    PolarWebhookEvent,
    {
      type: "refund.created" | "refund.updated";
    }
  >,
): Promise<void> {
  const businessId: Id<"businesses"> | null = await ctx.runMutation(
    internal.billing.findBusinessIdForCustomerMutation,
    {
      polarCustomerId: event.data.customerId,
    },
  );

  if (!businessId) {
    return;
  }

  await ctx.runMutation(internal.billing.upsertTransactionFromWebhook, {
    businessId,
    kind: "refund",
    sourceId: event.data.id,
    status: event.data.status,
    amountCents: event.data.amount,
    currency: event.data.currency,
    description: event.data.reason,
    ...(event.data.orderId ? { orderId: event.data.orderId } : {}),
    ...(event.data.subscriptionId ? { subscriptionId: event.data.subscriptionId } : {}),
    ...(event.data.customerId ? { polarCustomerId: event.data.customerId } : {}),
    occurredAt: event.data.createdAt.toISOString(),
    lastSyncedAt: event.timestamp.toISOString(),
  });
}

export const findBusinessIdForCustomerMutation = internalMutation({
  args: {
    polarCustomerId: v.string(),
  },
  returns: v.union(v.id("businesses"), v.null()),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("billing_accounts")
      .withIndex("by_polar_customer_id", (q) => q.eq("polarCustomerId", args.polarCustomerId))
      .unique();

    return account?.businessId ?? null;
  },
});

export const syncSubscriptionFromWebhook = internalMutation({
  args: {
    businessId: v.id("businesses"),
    billingKey: v.string(),
    polarCustomerId: v.string(),
    polarCustomerExternalId: v.string(),
    billingContactEmail: v.optional(v.string()),
    billingContactName: v.optional(v.string()),
    subscriptionId: v.string(),
    subscriptionProductId: v.string(),
    subscriptionPriceId: v.optional(v.string()),
    subscriptionState: v.string(),
    currentPeriodStart: v.string(),
    currentPeriodEnd: v.string(),
    cancelAtPeriodEnd: v.boolean(),
    checkoutId: v.optional(v.string()),
    lastWebhookEventType: v.string(),
    lastSyncedAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentTier = deriveBillingTier({
      subscriptionStatus: args.subscriptionState,
      subscriptionProductId: args.subscriptionProductId,
    });
    const existingAccount = await getBillingAccount(ctx, args.businessId);
    const patch = {
      businessId: args.businessId,
      billingKey: args.billingKey,
      currentTier,
      subscriptionState: args.subscriptionState,
      polarCustomerId: args.polarCustomerId,
      polarCustomerExternalId: args.polarCustomerExternalId,
      ...(args.billingContactEmail ? { billingContactEmail: args.billingContactEmail } : {}),
      ...(args.billingContactName ? { billingContactName: args.billingContactName } : {}),
      subscriptionId: args.subscriptionId,
      subscriptionProductId: args.subscriptionProductId,
      ...(args.subscriptionPriceId ? { subscriptionPriceId: args.subscriptionPriceId } : {}),
      ...(args.checkoutId ? { checkoutId: args.checkoutId } : {}),
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      lastWebhookEventType: args.lastWebhookEventType,
      lastSyncedAt: args.lastSyncedAt,
    };

    if (existingAccount) {
      await ctx.db.patch(existingAccount._id, patch);
    } else {
      await ctx.db.insert("billing_accounts", patch);
    }

    const existingComponentCustomer = await ctx.runQuery(
      components.polar.lib.getCustomerByUserId,
      { userId: args.billingKey },
    );

    if (!existingComponentCustomer) {
      await ctx.runMutation(components.polar.lib.insertCustomer, {
        id: args.polarCustomerId,
        userId: args.billingKey,
      });
    }

    return null;
  },
});

export const upsertTransactionFromWebhook = internalMutation({
  args: {
    businessId: v.id("businesses"),
    kind: v.string(),
    sourceId: v.string(),
    status: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    description: v.optional(v.string()),
    invoiceUrl: v.optional(v.string()),
    orderId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    polarCustomerId: v.optional(v.string()),
    occurredAt: v.string(),
    lastSyncedAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billing_transactions")
      .withIndex("by_kind_and_source_id", (q) =>
        q.eq("kind", args.kind).eq("sourceId", args.sourceId),
      )
      .unique();

    const patch = {
      businessId: args.businessId,
      kind: args.kind,
      sourceId: args.sourceId,
      status: args.status,
      amountCents: args.amountCents,
      currency: args.currency,
      ...(args.description ? { description: args.description } : {}),
      ...(args.invoiceUrl ? { invoiceUrl: args.invoiceUrl } : {}),
      ...(args.orderId ? { orderId: args.orderId } : {}),
      ...(args.subscriptionId ? { subscriptionId: args.subscriptionId } : {}),
      ...(args.polarCustomerId ? { polarCustomerId: args.polarCustomerId } : {}),
      occurredAt: args.occurredAt,
      lastSyncedAt: args.lastSyncedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("billing_transactions", patch);
    }

    return null;
  },
});

export const getCheckoutContext = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    billingKey: v.string(),
    billingContactEmail: v.union(v.string(), v.null()),
    billingContactName: v.union(v.string(), v.null()),
    polarCustomerId: v.union(v.string(), v.null()),
    polarCustomerExternalId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<CheckoutContext> => {
    const currentUser = await requireCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    const account = await getBillingAccount(ctx, args.businessId);
    const contact = await resolveBillingContact(ctx, {
      businessId: args.businessId,
      currentUser,
      account,
    });

    return {
      billingKey: getBillingKey(args.businessId),
      billingContactEmail: contact.email,
      billingContactName: contact.name,
      polarCustomerId: account?.polarCustomerId ?? null,
      polarCustomerExternalId: account?.polarCustomerExternalId ?? null,
    };
  },
});

export const upsertCustomerLink = internalMutation({
  args: {
    businessId: v.id("businesses"),
    billingKey: v.string(),
    polarCustomerId: v.string(),
    polarCustomerExternalId: v.string(),
    billingContactEmail: v.optional(v.string()),
    billingContactName: v.optional(v.string()),
    lastSyncedAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existingAccount = await getBillingAccount(ctx, args.businessId);

    if (existingAccount) {
      await ctx.db.patch(existingAccount._id, {
        billingKey: args.billingKey,
        polarCustomerId: args.polarCustomerId,
        polarCustomerExternalId: args.polarCustomerExternalId,
        ...(args.billingContactEmail ? { billingContactEmail: args.billingContactEmail } : {}),
        ...(args.billingContactName ? { billingContactName: args.billingContactName } : {}),
        lastSyncedAt: args.lastSyncedAt,
      });
    } else {
      await ctx.db.insert("billing_accounts", {
        businessId: args.businessId,
        billingKey: args.billingKey,
        currentTier: "free",
        subscriptionState: "inactive",
        polarCustomerId: args.polarCustomerId,
        polarCustomerExternalId: args.polarCustomerExternalId,
        ...(args.billingContactEmail ? { billingContactEmail: args.billingContactEmail } : {}),
        ...(args.billingContactName ? { billingContactName: args.billingContactName } : {}),
        lastSyncedAt: args.lastSyncedAt,
      });
    }

    const existingComponentCustomer = await ctx.runQuery(
      components.polar.lib.getCustomerByUserId,
      { userId: args.billingKey },
    );

    if (!existingComponentCustomer) {
      await ctx.runMutation(components.polar.lib.insertCustomer, {
        id: args.polarCustomerId,
        userId: args.billingKey,
      });
    }

    return null;
  },
});

async function ensurePolarCustomer(
  ctx: ActionCtx,
  args: {
    businessId: Id<"businesses">;
    checkoutContext: CheckoutContext;
  },
): Promise<{ id: string; externalId: string }> {
  const client = createPolarClient();
  const existingExternalId = args.checkoutContext.polarCustomerExternalId ?? args.checkoutContext.billingKey;

  try {
    const customer = await client.customers.getExternal({
      externalId: existingExternalId,
    });

    await ctx.runMutation(internal.billing.upsertCustomerLink, {
      businessId: args.businessId,
      billingKey: args.checkoutContext.billingKey,
      polarCustomerId: customer.id,
      polarCustomerExternalId: existingExternalId,
      ...(args.checkoutContext.billingContactEmail
        ? { billingContactEmail: args.checkoutContext.billingContactEmail }
        : {}),
      ...(args.checkoutContext.billingContactName
        ? { billingContactName: args.checkoutContext.billingContactName }
        : {}),
      lastSyncedAt: new Date().toISOString(),
    });

    return {
      id: customer.id,
      externalId: existingExternalId,
    };
  } catch {
    if (!args.checkoutContext.billingContactEmail) {
      throw new Error("No billing contact email is configured for this business.");
    }

    const customer = await client.customers.create({
      email: args.checkoutContext.billingContactEmail,
      ...(args.checkoutContext.billingContactName
        ? { name: args.checkoutContext.billingContactName }
        : {}),
      externalId: args.checkoutContext.billingKey,
      metadata: {
        billingKey: args.checkoutContext.billingKey,
        businessId: String(args.businessId),
      },
    });

    await ctx.runMutation(internal.billing.upsertCustomerLink, {
      businessId: args.businessId,
      billingKey: args.checkoutContext.billingKey,
      polarCustomerId: customer.id,
      polarCustomerExternalId: args.checkoutContext.billingKey,
      billingContactEmail: args.checkoutContext.billingContactEmail,
      ...(args.checkoutContext.billingContactName
        ? { billingContactName: args.checkoutContext.billingContactName }
        : {}),
      lastSyncedAt: new Date().toISOString(),
    });

    return {
      id: customer.id,
      externalId: args.checkoutContext.billingKey,
    };
  }
}

export const startCheckout = action({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const checkoutContext: CheckoutContext = await ctx.runQuery(
      internal.billing.getCheckoutContext,
      {
        businessId: args.businessId,
      },
    );
    const customer = await ensurePolarCustomer(ctx, {
      businessId: args.businessId,
      checkoutContext,
    });
    const siteUrl = getBillingSiteUrl();
    const client = createPolarClient();
    const checkout = await client.checkouts.create({
      externalCustomerId: customer.externalId,
      ...(checkoutContext.billingContactEmail
        ? { customerEmail: checkoutContext.billingContactEmail }
        : {}),
      ...(checkoutContext.billingContactName
        ? { customerName: checkoutContext.billingContactName }
        : {}),
      products: [getPaidProductId()],
      successUrl: new URL("/settings/billing?checkout=success", siteUrl).toString(),
      returnUrl: new URL("/settings/billing", siteUrl).toString(),
      embedOrigin: siteUrl.origin,
      customerMetadata: {
        billingKey: checkoutContext.billingKey,
        businessId: String(args.businessId),
      },
      metadata: {
        billingKey: checkoutContext.billingKey,
        businessId: String(args.businessId),
      },
    });

    await ctx.runMutation(internal.billing.syncCheckoutSession, {
      businessId: args.businessId,
      checkoutId: checkout.id,
      lastSyncedAt: new Date().toISOString(),
    });

    return {
      url: checkout.url,
    };
  },
});

export const openPortal = action({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const checkoutContext: CheckoutContext = await ctx.runQuery(
      internal.billing.getCheckoutContext,
      {
        businessId: args.businessId,
      },
    );
    const customer = await ensurePolarCustomer(ctx, {
      businessId: args.businessId,
      checkoutContext,
    });
    const siteUrl = getBillingSiteUrl();
    const session = await createPolarClient().customerSessions.create({
      externalCustomerId: customer.externalId,
      returnUrl: new URL("/settings/billing", siteUrl).toString(),
    });

    return {
      url: session.customerPortalUrl,
    };
  },
});

export const syncCheckoutSession = internalMutation({
  args: {
    businessId: v.id("businesses"),
    checkoutId: v.string(),
    lastSyncedAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const account = await getBillingAccount(ctx, args.businessId);
    if (!account) {
      return null;
    }

    await ctx.db.patch(account._id, {
      checkoutId: args.checkoutId,
      lastSyncedAt: args.lastSyncedAt,
    });

    return null;
  },
});

export const getStatus = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<BillingStatus> => {
    const currentUser = await requireCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
    });
    const contact = await resolveBillingContact(ctx, {
      businessId: args.businessId,
      currentUser,
      account: snapshot.account,
    });

    const recentTransactions = await ctx.db
      .query("billing_transactions")
      .withIndex("by_business_id_and_occurred_at", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .take(10);

    return buildBillingStatus({
      billingKey: getBillingKey(args.businessId),
      tier: snapshot.tier,
      subscriptionState: snapshot.account?.subscriptionState ?? "inactive",
      contact,
      usage: snapshot.usage,
      periodKey: snapshot.periodKey,
      recentTransactions: recentTransactions.map((transaction) => ({
        kind: transaction.kind as BillingTransactionKind,
        sourceId: transaction.sourceId,
        status: transaction.status,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        description: transaction.description ?? null,
        occurredAt: transaction.occurredAt,
        invoiceUrl: transaction.invoiceUrl ?? null,
      })),
      hasCustomerPortalAccess: Boolean(snapshot.account?.polarCustomerId),
      hasCheckoutAccess: Boolean(
        process.env.POLAR_PAID_PRODUCT_ID?.trim() && process.env.SITE_URL?.trim(),
      ),
    });
  },
});

export const listTransactions = query({
  args: {
    businessId: v.id("businesses"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      kind: v.string(),
      sourceId: v.string(),
      status: v.string(),
      amountCents: v.number(),
      currency: v.string(),
      description: v.union(v.string(), v.null()),
      occurredAt: v.string(),
      invoiceUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const transactions = await ctx.db
      .query("billing_transactions")
      .withIndex("by_business_id_and_occurred_at", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .take(limit);

    return transactions.map((transaction) => ({
      kind: transaction.kind,
      sourceId: transaction.sourceId,
      status: transaction.status,
      amountCents: transaction.amountCents,
      currency: transaction.currency,
      description: transaction.description ?? null,
      occurredAt: transaction.occurredAt,
      invoiceUrl: transaction.invoiceUrl ?? null,
    }));
  },
});

export const getUsageSyncPayload = internalQuery({
  args: {
    usageEventId: v.id("billing_usage_events"),
  },
  returns: v.union(
    v.object({
      businessId: v.id("businesses"),
      billingKey: v.string(),
      usageKind: v.string(),
      quantity: v.number(),
      sourceKey: v.string(),
      recordedAt: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<SendBillingUsagePayload | null> => {
    const usageEvent = await ctx.db.get(args.usageEventId);
    if (!usageEvent || usageEvent.syncStatus === "succeeded" || usageEvent.syncStatus === "skipped") {
      return null;
    }

    const account = await getBillingAccount(ctx, usageEvent.businessId);
    if (!account?.polarCustomerId) {
      return null;
    }

    return {
      businessId: usageEvent.businessId,
      billingKey: account.billingKey,
      usageKind: usageEvent.usageKind as BillingUsageKind,
      quantity: usageEvent.quantity,
      sourceKey: usageEvent.sourceKey,
      recordedAt: usageEvent.recordedAt,
    };
  },
});

export const markUsageEventSyncResult = internalMutation({
  args: {
    usageEventId: v.id("billing_usage_events"),
    syncStatus: v.string(),
    syncAttemptedAt: v.string(),
    syncedAt: v.optional(v.string()),
    syncError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const usageEvent = await ctx.db.get(args.usageEventId);
    if (!usageEvent) {
      return null;
    }

    await ctx.db.patch(args.usageEventId, {
      syncStatus: args.syncStatus,
      syncAttemptedAt: args.syncAttemptedAt,
      ...(args.syncedAt ? { syncedAt: args.syncedAt } : {}),
      ...(args.syncError ? { syncError: args.syncError } : {}),
    });

    return null;
  },
});

export const recordUsageEvent = internalMutation({
  args: {
    businessId: v.id("businesses"),
    usageKind: v.string(),
    quantity: v.number(),
    sourceKey: v.string(),
    recordedAt: v.string(),
  },
  returns: v.object({
    usageEventId: v.id("billing_usage_events"),
    tier: v.string(),
    syncNeeded: v.boolean(),
  }),
  handler: async (ctx, args): Promise<RecordUsageEventResult> => {
    const existingUsageEvent = await ctx.db
      .query("billing_usage_events")
      .withIndex("by_business_id_and_source_key", (q) =>
        q.eq("businessId", args.businessId).eq("sourceKey", args.sourceKey),
      )
      .unique();

    if (existingUsageEvent) {
      return {
        usageEventId: existingUsageEvent._id,
        tier: existingUsageEvent.tierAtRecordTime as BillingTier,
        syncNeeded:
          existingUsageEvent.syncStatus === "pending" ||
          existingUsageEvent.syncStatus === "failed",
      };
    }

    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
      at: args.recordedAt,
    });
    const included = getBillingIncludedUsage(snapshot.tier);
    const nextVoiceSecondsUsed =
      (snapshot.usage?.voiceSecondsUsed ?? 0) +
      (args.usageKind === "voice_seconds" ? args.quantity : 0);
    const nextSmsSegmentsUsed =
      (snapshot.usage?.smsSegmentsUsed ?? 0) +
      (args.usageKind === "sms_segments" ? args.quantity : 0);
    const nextVoiceBlocked =
      included.voiceSecondsIncluded === null
        ? false
        : nextVoiceSecondsUsed >= included.voiceSecondsIncluded;
    const nextSmsBlocked =
      included.smsSegmentsIncluded === null
        ? false
        : nextSmsSegmentsUsed >= included.smsSegmentsIncluded;

    if (snapshot.usage) {
      await ctx.db.patch(snapshot.usage._id, {
        tier: snapshot.tier,
        voiceSecondsUsed: nextVoiceSecondsUsed,
        smsSegmentsUsed: nextSmsSegmentsUsed,
        ...(included.voiceSecondsIncluded !== null
          ? { voiceSecondsIncluded: included.voiceSecondsIncluded }
          : {}),
        ...(included.smsSegmentsIncluded !== null
          ? { smsSegmentsIncluded: included.smsSegmentsIncluded }
          : {}),
        voiceBlocked: nextVoiceBlocked,
        smsBlocked: nextSmsBlocked,
        lastRecordedAt: args.recordedAt,
      });
    } else {
      await ctx.db.insert("billing_usage_months", {
        businessId: args.businessId,
        periodKey: snapshot.periodKey,
        tier: snapshot.tier,
        voiceSecondsUsed: nextVoiceSecondsUsed,
        smsSegmentsUsed: nextSmsSegmentsUsed,
        ...(included.voiceSecondsIncluded !== null
          ? { voiceSecondsIncluded: included.voiceSecondsIncluded }
          : {}),
        ...(included.smsSegmentsIncluded !== null
          ? { smsSegmentsIncluded: included.smsSegmentsIncluded }
          : {}),
        voiceBlocked: nextVoiceBlocked,
        smsBlocked: nextSmsBlocked,
        lastRecordedAt: args.recordedAt,
      });
    }

    const usageEventId = await ctx.db.insert("billing_usage_events", {
      businessId: args.businessId,
      periodKey: snapshot.periodKey,
      sourceKey: args.sourceKey,
      usageKind: args.usageKind,
      quantity: args.quantity,
      tierAtRecordTime: snapshot.tier,
      recordedAt: args.recordedAt,
      syncStatus: snapshot.tier === "paid_monthly" ? "pending" : "skipped",
    });

    return {
      usageEventId,
      tier: snapshot.tier,
      syncNeeded: snapshot.tier === "paid_monthly",
    };
  },
});

export const syncUsageEventToPolar = internalAction({
  args: {
    usageEventId: v.id("billing_usage_events"),
  },
  returns: v.object({
    synced: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const payload: SendBillingUsagePayload | null = await ctx.runQuery(
      internal.billing.getUsageSyncPayload,
      {
        usageEventId: args.usageEventId,
      },
    );

    if (!payload) {
      return { synced: false };
    }

    const syncAttemptedAt = new Date().toISOString();

    try {
      await createPolarClient().events.ingest({
        events: [
          {
            name:
              payload.usageKind === "voice_seconds"
                ? billingMeterEventNames.voiceSeconds
                : billingMeterEventNames.smsSegments,
            externalCustomerId: payload.billingKey,
            externalId: payload.sourceKey,
            timestamp: new Date(payload.recordedAt),
            metadata: {
              quantity: payload.quantity,
              businessId: String(payload.businessId),
              usageKind: payload.usageKind,
            },
          },
        ],
      });

      await ctx.runMutation(internal.billing.markUsageEventSyncResult, {
        usageEventId: args.usageEventId,
        syncStatus: "succeeded",
        syncAttemptedAt,
        syncedAt: syncAttemptedAt,
      });

      return { synced: true };
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      await ctx.runMutation(internal.billing.markUsageEventSyncResult, {
        usageEventId: args.usageEventId,
        syncStatus: "failed",
        syncAttemptedAt,
        syncError: errorMessage,
      });

      return {
        synced: false,
        error: errorMessage,
      };
    }
  },
});

export const assertSmsCanSend = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    allowed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
    });
    const usage = getBillingUsageSnapshotData({
      tier: snapshot.tier,
      periodKey: snapshot.periodKey,
      usage: snapshot.usage,
    });

    return {
      allowed: !usage.smsBlocked,
    };
  },
});

export const recordVoiceUsage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    quantity: v.number(),
    recordedAt: v.string(),
  },
  returns: v.object({
    usageEventId: v.id("billing_usage_events"),
    tier: v.string(),
    syncNeeded: v.boolean(),
  }),
  handler: async (ctx, args): Promise<RecordUsageEventResult> => {
    return await ctx.runMutation(internal.billing.recordUsageEvent, {
      businessId: args.businessId,
      usageKind: "voice_seconds",
      quantity: args.quantity,
      sourceKey: `voice:${String(args.callId)}`,
      recordedAt: args.recordedAt,
    });
  },
});

export const recordSmsUsage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    messageId: v.id("messages"),
    quantity: v.number(),
    recordedAt: v.string(),
  },
  returns: v.object({
    usageEventId: v.id("billing_usage_events"),
    tier: v.string(),
    syncNeeded: v.boolean(),
  }),
  handler: async (ctx, args): Promise<RecordUsageEventResult> => {
    return await ctx.runMutation(internal.billing.recordUsageEvent, {
      businessId: args.businessId,
      usageKind: "sms_segments",
      quantity: args.quantity,
      sourceKey: `sms:${String(args.messageId)}`,
      recordedAt: args.recordedAt,
    });
  },
});

export const markMessageBillingBlocked = internalMutation({
  args: {
    messageId: v.id("messages"),
    providerUpdatedAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      return null;
    }

    await ctx.db.patch(args.messageId, {
      status: "failed",
      providerStatus: "billing_blocked",
      providerUpdatedAt: args.providerUpdatedAt,
    });

    return null;
  },
});
