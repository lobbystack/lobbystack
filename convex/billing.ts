import {
  Polar as ConvexPolar,
  type PolarWebhookEvent } from "@convex-dev/polar";
import { observedInternalAction as internalAction, observedInternalMutation as internalMutation } from "./telemetry/observedFunctions";
import { Polar as PolarSdk } from "@polar-sh/sdk";
import type { HttpRouter } from "convex/server";
import { v } from "convex/values";

import type {
  BillingAddonSlug,
  BillingErrorCode,
  BillingPlanSlug,
  BillingStatus,
  BillingTransactionKind,
  BillingTransactionSummary,
  BillingUsageKind,
  HostedCheckoutPlanSlug,
  SmsCapability,
  SmsSenderRole,
  } from "../packages/shared/src/billing";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
  } from "./telemetry/shared";
import {
  billingAddonCatalog,
  billingErrorCodes,
  billingPlanCatalog,
  getBillingMonthlyChargeCents,
  getKnowledgeStorageLimitBytes,
  getPolarMeteredUsagePayload,
  } from "../packages/shared/src/billing";
import { components,
  internal } from "./_generated/api";
import type { Doc,
  Id } from "./_generated/dataModel";
import {
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireCurrentUser, requireMembership } from "./lib/auth";
import {
  isAiSmsAddonCheckoutConfigured,
  canPurchaseAiSmsAddon,
  deriveActiveAddonsFromProductIds,
  deriveCloudPlanFromProductIds,
  getAiSmsAddonPricing,
  getAiSmsAddonProductIds,
  getBillingAccount,
  getBillingKey,
  getBillingSnapshot,
  getBillingUsageMonth,
  getBillingUsageSnapshotData,
  getConfiguredCheckoutPlans,
  getNormalizedAddons,
  getPlanEntitlements,
  getPlanForBusiness,
  getProProductId,
  isAiSmsEnabled,
} from "./lib/billing";
import {
  hasBillingManagementAccess,
  requireBillingManagementAccess,
} from "./lib/billingAccess";
import { selectSmsSenderPhoneNumber } from "./lib/smsPhoneNumbers";
import {
  isSmsComplianceApproved,
  smsComplianceStatusValidator,
  smsSenderModeValidator,
  type SmsComplianceStatus,
  type SmsSenderMode,
} from "./lib/smsCompliance";
import {
  enqueuePostHogEventBestEffort,
  enqueuePostHogProviderExceptionBestEffort,
} from "./telemetry/posthog";

import { observedAction as action } from "./telemetry/observedFunctions";
type BillingContact = {
  email: string | null;
  name: string | null;
};

function getAlertSmsUsageSourceKey(input: {
  notificationId?: Id<"notifications">;
  sourceKey?: string;
}): string {
  const sourceKey = input.sourceKey?.trim();
  if (sourceKey) {
    return sourceKey;
  }
  if (input.notificationId) {
    return `alert_sms:${String(input.notificationId)}`;
  }
  throw new Error("Alert SMS usage requires a notificationId or sourceKey.");
}

type CheckoutTarget = HostedCheckoutPlanSlug | BillingAddonSlug;

type CheckoutContext = {
  billingKey: string;
  billingContactEmail: string | null;
  billingContactName: string | null;
  polarCustomerId: string | null;
  polarCustomerExternalId: string | null;
  checkoutId: string | null;
};

type PolarClient = ReturnType<typeof createPolarClient>;
type PolarCheckout = Awaited<ReturnType<PolarClient["checkouts"]["get"]>>;
type PolarCustomer = Awaited<ReturnType<PolarClient["customers"]["create"]>>;
type PolarSubscription = Awaited<ReturnType<PolarClient["subscriptions"]["get"]>>;

type PolarBillingSubscription = {
  id: string;
  customerId: string;
  productId: string;
  prices: Array<{ id?: string }>;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  checkoutId: string | null;
  metadata?: Record<string, string | number | boolean>;
  customer?: {
    externalId?: string | null | undefined;
    email?: string | null | undefined;
    name?: string | null | undefined;
  };
};

type UsageSyncPayload = {
  businessId: Id<"businesses">;
  billingKey: string;
  usageKind: BillingUsageKind;
  quantity: number;
  polarEventName: string;
  polarQuantity: number;
  sourceKey: string;
  recordedAt: string;
};

type UpsertUsageResult = {
  usageEventId: Id<"billing_usage_events">;
  plan: BillingPlanSlug;
  activeAddons: Array<BillingAddonSlug>;
  syncNeeded: boolean;
};

type UsageReservationResult = {
  allowed: boolean;
  errorCode: BillingErrorCode | null;
  usageEventId?: Id<"billing_usage_events">;
  syncNeeded?: boolean;
};

type PricingSummary = {
  plan: BillingPlanSlug;
  activeAddons: Array<BillingAddonSlug>;
  aiSmsEnabled: boolean;
  alertSmsPlatformSenderConfigured: boolean;
  proMonthlyChargeCents: number;
  aiSmsMonthlyChargeCents: number;
  aiSmsSetupChargeCents: number;
};

type SmsCapabilityPolicy = {
  allowed: boolean;
  senderRole: SmsSenderRole;
  senderMode: SmsSenderMode;
  fromPhoneNumber?: string;
  twilioMessagingServiceSid?: string;
  complianceStatus?: SmsComplianceStatus;
  errorCode: BillingErrorCode | null;
};

type UsageSyncTelemetryEventName =
  | "ops.billing.usage_sync_failed"
  | "ops.billing.usage_sync_recovered";

const MIN_BILLABLE_VOICE_DURATION_SECONDS = 10;

const USAGE_SYNC_RETRY_DELAYS_MS = [
  30_000,
  120_000,
  600_000,
  1_800_000,
] as const;

async function emitUsageSyncTelemetry(
  ctx: Pick<ActionCtx, "runMutation">,
  input: {
    eventName: UsageSyncTelemetryEventName;
    businessId: Id<"businesses">;
    usageKind: BillingUsageKind;
    quantity: number;
    sourceKey: string;
    attemptNumber: number;
    retryScheduled?: boolean;
    retryDelayMs?: number;
    errorType?: string;
    recovered?: boolean;
  },
): Promise<void> {
  await enqueuePostHogEventBestEffort(ctx, {
    eventName: input.eventName,
    businessId: input.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(String(input.businessId)),
    groupKey: getPostHogBusinessGroupKey(String(input.businessId)),
    provider: "polar",
    properties: {
      usageKind: input.usageKind,
      quantity: input.quantity,
      sourceKey: input.sourceKey,
      attemptNumber: input.attemptNumber,
      ...(input.retryScheduled !== undefined
        ? { retryScheduled: input.retryScheduled }
        : {}),
      ...(input.retryDelayMs !== undefined ? { retryDelayMs: input.retryDelayMs } : {}),
      ...(input.errorType ? { errorType: input.errorType } : {}),
      ...(input.recovered !== undefined ? { recovered: input.recovered } : {}),
    },
  });
}

const billingPolar = new ConvexPolar(components.polar, {
  getUserInfo: async () => ({
    userId: "",
    email: "",
  }),
  server: getPolarServer(),
});

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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown billing error.";
}

function isActiveSubscriptionStatus(status: string | undefined): boolean {
  return status === "active" || status === "trialing";
}

function parseBusinessIdFromBillingKey(
  billingKey: string | null | undefined,
): Id<"businesses"> | null {
  if (!billingKey || !billingKey.startsWith("business:")) {
    return null;
  }

  return billingKey.slice("business:".length) as Id<"businesses">;
}

function getMetadataString(
  metadata: Record<string, string | number | boolean>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolvePolarBillingKey(input: {
  customerExternalId?: string | null;
  metadata: Record<string, string | number | boolean>;
}): string | null {
  const metadataBillingKey = getMetadataString(input.metadata, "billingKey");
  if (parseBusinessIdFromBillingKey(metadataBillingKey)) {
    return metadataBillingKey;
  }

  const metadataBusinessId = getMetadataString(input.metadata, "businessId");
  if (metadataBusinessId) {
    return getBillingKey(metadataBusinessId as Id<"businesses">);
  }

  const customerBillingKey = parseBusinessIdFromBillingKey(input.customerExternalId)
    ? input.customerExternalId
    : null;
  return customerBillingKey ?? null;
}

function getUsageQuantityField(
  usageKind: BillingUsageKind,
): "voiceSecondsUsed" | "alertSmsSegmentsUsed" | "outboundCallAttemptsUsed" | "aiSmsSegmentsUsed" {
  switch (usageKind) {
    case "voice_seconds":
      return "voiceSecondsUsed";
    case "alert_sms_segments":
      return "alertSmsSegmentsUsed";
    case "outbound_call_attempts":
      return "outboundCallAttemptsUsed";
    case "ai_sms_segments":
      return "aiSmsSegmentsUsed";
  }
}

function getBillableVoiceUsageSeconds(durationSeconds: number): number {
  const normalizedDurationSeconds = Math.max(0, durationSeconds);
  return normalizedDurationSeconds < MIN_BILLABLE_VOICE_DURATION_SECONDS
    ? 0
    : normalizedDurationSeconds;
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

function hasPolarCustomerPortalAccess(account: Doc<"billing_accounts"> | null): boolean {
  return Boolean(
    account?.polarCustomerId && (account.proSubscriptionId || account.aiSmsSubscriptionId),
  );
}

function buildBillingStatus(input: {
  billingKey: string;
  plan: BillingPlanSlug;
  activeAddons: Array<BillingAddonSlug>;
  aiSmsReady: boolean;
  subscriptionState: string;
  contact: BillingContact;
  usage: Doc<"billing_usage_months"> | null;
  periodKey: string;
  recentTransactions: Array<BillingTransactionSummary>;
  hasBillingManagementAccess: boolean;
  hasCustomerPortalAccess: boolean;
  availableCheckoutPlans: Array<HostedCheckoutPlanSlug>;
  aiSmsAddonCheckoutConfigured: boolean;
  knowledgeStorageUsageBytes: number;
}): BillingStatus {
  const usage = getBillingUsageSnapshotData({
    plan: input.plan,
    periodKey: input.periodKey,
    usage: input.usage,
  });
  const knowledgeStorageBytesIncluded = getKnowledgeStorageLimitBytes(input.plan);
  const aiSmsAddonEligible = canPurchaseAiSmsAddon({
    plan: input.plan,
    activeAddons: input.activeAddons,
  });
  const canPurchaseConfiguredAiSmsAddon =
    aiSmsAddonEligible && input.aiSmsAddonCheckoutConfigured;

  return {
    plan: input.plan,
    billingKey: input.billingKey,
    subscriptionState: input.subscriptionState,
    activeAddons: input.activeAddons,
    aiSmsEnabled: isAiSmsEnabled({
      plan: input.plan,
      activeAddons: input.activeAddons,
    }),
    aiSmsReady: input.aiSmsReady,
    overagesBillable: billingPlanCatalog[input.plan].overagesBillable,
    monthlyChargeCents: getBillingMonthlyChargeCents({
      plan: input.plan,
      activeAddons: input.activeAddons,
    }),
    billingContactEmail: input.hasBillingManagementAccess ? input.contact.email : null,
    billingContactName: input.hasBillingManagementAccess ? input.contact.name : null,
    includedBusinessNumbers: billingPlanCatalog[input.plan].includedBusinessNumbers,
    hasBillingManagementAccess: input.hasBillingManagementAccess,
    hasCustomerPortalAccess:
      input.hasBillingManagementAccess && input.hasCustomerPortalAccess,
    hasCheckoutAccess:
      input.hasBillingManagementAccess &&
      (input.availableCheckoutPlans.length > 0 || canPurchaseConfiguredAiSmsAddon),
    availableCheckoutPlans: input.hasBillingManagementAccess
      ? input.availableCheckoutPlans
      : [],
    canPurchaseAiSmsAddon:
      input.hasBillingManagementAccess && canPurchaseConfiguredAiSmsAddon,
    usage: {
      ...usage,
      knowledgeStorageBytesUsed: input.knowledgeStorageUsageBytes,
      knowledgeStorageBytesIncluded,
      knowledgeStorageBlocked:
        knowledgeStorageBytesIncluded !== null &&
        input.knowledgeStorageUsageBytes >= knowledgeStorageBytesIncluded,
    },
    recentTransactions: input.hasBillingManagementAccess ? input.recentTransactions : [],
  };
}

function shouldSyncUsageEvent(args: {
  plan: BillingPlanSlug;
  activeAddons: Array<BillingAddonSlug>;
  usageKind: BillingUsageKind;
}): boolean {
  if (args.plan !== "pro") {
    return false;
  }

  if (args.usageKind === "ai_sms_segments") {
    return args.activeAddons.includes("ai_sms");
  }

  return true;
}

function buildUsageMonthPatch(args: {
  plan: BillingPlanSlug;
  usage: Doc<"billing_usage_months"> | null;
  usageKind: BillingUsageKind;
  deltaQuantity: number;
  recordedAt: string;
}) {
  const entitlements = getPlanEntitlements(args.plan);
  const currentVoiceSeconds = args.usage?.voiceSecondsUsed ?? 0;
  const currentAlertSmsSegments = args.usage?.alertSmsSegmentsUsed ?? 0;
  const currentOutboundCallAttempts = args.usage?.outboundCallAttemptsUsed ?? 0;
  const currentAiSmsSegments = args.usage?.aiSmsSegmentsUsed ?? 0;

  const nextVoiceSeconds =
    currentVoiceSeconds + (args.usageKind === "voice_seconds" ? args.deltaQuantity : 0);
  const nextAlertSmsSegments =
    currentAlertSmsSegments +
    (args.usageKind === "alert_sms_segments" ? args.deltaQuantity : 0);
  const nextOutboundCallAttempts =
    currentOutboundCallAttempts +
    (args.usageKind === "outbound_call_attempts" ? args.deltaQuantity : 0);
  const nextAiSmsSegments =
    currentAiSmsSegments + (args.usageKind === "ai_sms_segments" ? args.deltaQuantity : 0);

  return {
    planAtSnapshot: args.plan,
    voiceSecondsUsed: Math.max(0, nextVoiceSeconds),
    alertSmsSegmentsUsed: Math.max(0, nextAlertSmsSegments),
    outboundCallAttemptsUsed: Math.max(0, nextOutboundCallAttempts),
    aiSmsSegmentsUsed: Math.max(0, nextAiSmsSegments),
    ...(entitlements.voiceSecondsIncluded !== null
      ? { voiceSecondsIncluded: entitlements.voiceSecondsIncluded }
      : {}),
    ...(entitlements.alertSmsSegmentsIncluded !== null
      ? { alertSmsSegmentsIncluded: entitlements.alertSmsSegmentsIncluded }
      : {}),
    ...(entitlements.outboundCallAttemptsIncluded !== null
      ? { outboundCallAttemptsIncluded: entitlements.outboundCallAttemptsIncluded }
      : {}),
    voiceBlocked:
      !entitlements.overagesBillable &&
      entitlements.voiceSecondsIncluded !== null &&
      nextVoiceSeconds >= entitlements.voiceSecondsIncluded,
    alertSmsBlocked:
      !entitlements.overagesBillable &&
      entitlements.alertSmsSegmentsIncluded !== null &&
      nextAlertSmsSegments >= entitlements.alertSmsSegmentsIncluded,
    outboundCallAttemptsBlocked:
      !entitlements.overagesBillable &&
      entitlements.outboundCallAttemptsIncluded !== null &&
      nextOutboundCallAttempts >= entitlements.outboundCallAttemptsIncluded,
    lastRecordedAt: args.recordedAt,
  };
}

async function upsertUsageEventInTx(
  ctx: MutationCtx,
  args: {
    businessId: Id<"businesses">;
    usageKind: BillingUsageKind;
    quantity: number;
    sourceKey: string;
    recordedAt: string;
  },
): Promise<UpsertUsageResult> {
  const snapshot = await getBillingSnapshot(ctx, {
    businessId: args.businessId,
    at: args.recordedAt,
  });
  const syncNeeded = shouldSyncUsageEvent({
    plan: snapshot.plan,
    activeAddons: snapshot.activeAddons,
    usageKind: args.usageKind,
  });

  const existingUsageEvent = await ctx.db
    .query("billing_usage_events")
    .withIndex("by_business_id_and_source_key", (q) =>
      q.eq("businessId", args.businessId).eq("sourceKey", args.sourceKey),
    )
    .unique();

  const deltaQuantity = args.quantity - (existingUsageEvent?.quantity ?? 0);
  const existingPeriodKey = existingUsageEvent?.periodKey ?? null;
  const periodChanged =
    existingPeriodKey !== null && existingPeriodKey !== snapshot.periodKey;

  if (periodChanged && existingUsageEvent) {
    const previousUsageMonth = await getBillingUsageMonth(ctx, {
      businessId: args.businessId,
      periodKey: existingUsageEvent.periodKey,
    });
    if (previousUsageMonth) {
      const previousMonthPatch = buildUsageMonthPatch({
        plan:
          previousUsageMonth.planAtSnapshot ??
          existingUsageEvent.planAtRecordTime ??
          snapshot.plan,
        usage: previousUsageMonth,
        usageKind: args.usageKind,
        deltaQuantity: -existingUsageEvent.quantity,
        recordedAt: existingUsageEvent.recordedAt,
      });
      await ctx.db.patch(previousUsageMonth._id, previousMonthPatch);
    }
  }

  if (!snapshot.usage) {
    const monthPatch = buildUsageMonthPatch({
      plan: snapshot.plan,
      usage: null,
      usageKind: args.usageKind,
      deltaQuantity: args.quantity,
      recordedAt: args.recordedAt,
    });

    await ctx.db.insert("billing_usage_months", {
      businessId: args.businessId,
      periodKey: snapshot.periodKey,
      ...monthPatch,
    });
  } else if (periodChanged) {
    const monthPatch = buildUsageMonthPatch({
      plan: snapshot.plan,
      usage: snapshot.usage,
      usageKind: args.usageKind,
      deltaQuantity: args.quantity,
      recordedAt: args.recordedAt,
    });
    await ctx.db.patch(snapshot.usage._id, monthPatch);
  } else if (deltaQuantity !== 0) {
    const monthPatch = buildUsageMonthPatch({
      plan: snapshot.plan,
      usage: snapshot.usage,
      usageKind: args.usageKind,
      deltaQuantity,
      recordedAt: args.recordedAt,
    });
    await ctx.db.patch(snapshot.usage._id, monthPatch);
  } else if (snapshot.usage.lastRecordedAt !== args.recordedAt) {
    await ctx.db.patch(snapshot.usage._id, {
      lastRecordedAt: args.recordedAt,
    });
  }

  if (existingUsageEvent) {
    await ctx.db.patch(existingUsageEvent._id, {
      periodKey: snapshot.periodKey,
      quantity: args.quantity,
      planAtRecordTime: snapshot.plan,
      activeAddonsAtRecordTime: snapshot.activeAddons,
      recordedAt: args.recordedAt,
      syncStatus: syncNeeded ? "pending" : "skipped",
    });

    return {
      usageEventId: existingUsageEvent._id,
      plan: snapshot.plan,
      activeAddons: snapshot.activeAddons,
      syncNeeded,
    };
  }

  const usageEventId = await ctx.db.insert("billing_usage_events", {
    businessId: args.businessId,
    periodKey: snapshot.periodKey,
    sourceKey: args.sourceKey,
    usageKind: args.usageKind,
    quantity: args.quantity,
    planAtRecordTime: snapshot.plan,
    activeAddonsAtRecordTime: snapshot.activeAddons,
    recordedAt: args.recordedAt,
    syncStatus: syncNeeded ? "pending" : "skipped",
  });

  return {
    usageEventId,
    plan: snapshot.plan,
    activeAddons: snapshot.activeAddons,
    syncNeeded,
  };
}

function reserveVoiceSecondsForStart(args: {
  plan: BillingPlanSlug;
  usage: ReturnType<typeof getBillingUsageSnapshotData>;
}): number | null {
  const entitlements = billingPlanCatalog[args.plan];
  if (entitlements.overagesBillable || entitlements.voiceSecondsIncluded === null) {
    return null;
  }

  return args.usage.voiceSecondsRemaining;
}

function getPlatformAlertSmsSenderFromEnv(): string | null {
  const e164 = process.env.TWILIO_ALERT_SMS_FROM?.trim();
  return e164 && e164.length > 0 ? e164 : null;
}

function resolveApprovedBusinessSmsSender(input: {
  phoneNumbers: Array<Pick<Doc<"phone_numbers">, "_id" | "e164" | "smsEnabled" | "status">>;
  approvedPhoneNumberId?: Id<"phone_numbers">;
}): string | null {
  if (input.approvedPhoneNumberId === undefined) {
    return null;
  }

  const approvedPhoneNumber = input.phoneNumbers.find(
    (phoneNumber) => phoneNumber._id === input.approvedPhoneNumberId,
  );
  if (!approvedPhoneNumber) {
    return null;
  }

  return approvedPhoneNumber.status === "active" && approvedPhoneNumber.smsEnabled
    ? approvedPhoneNumber.e164
    : null;
}

function getTargetProductIds(target: CheckoutTarget): Array<string> {
  if (target === "pro") {
    return [getProProductId()];
  }

  const addonProducts = getAiSmsAddonProductIds();
  return [addonProducts.recurringProductId, addonProducts.setupFeeProductId];
}

function isDuplicatePolarCustomerEmailError(error: unknown): boolean {
  const detail = (error as { detail?: unknown }).detail;
  if (Array.isArray(detail)) {
    return detail.some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const loc = (item as { loc?: unknown }).loc;
      const msg = (item as { msg?: unknown }).msg;
      return (
        Array.isArray(loc) &&
        loc.includes("email") &&
        typeof msg === "string" &&
        msg.includes("already exists")
      );
    });
  }

  return getErrorMessage(error).includes("A customer with this email address already exists.");
}

function getPolarCustomerExternalId(customer: PolarCustomer): string | null {
  const externalId = customer.externalId?.trim();
  return externalId && externalId.length > 0 ? externalId : null;
}

async function findPolarCustomerByEmail(
  client: PolarClient,
  email: string,
): Promise<PolarCustomer | null> {
  const customers = await client.customers.list({
    email,
    limit: 1,
  });

  return customers.result.items[0] ?? null;
}

async function recoverExistingPolarCustomer(
  client: PolarClient,
  args: {
    billingKey: string;
    billingContactEmail: string;
    billingContactName: string | null;
  },
): Promise<PolarCustomer | null> {
  const existingCustomer = await findPolarCustomerByEmail(
    client,
    args.billingContactEmail,
  );
  if (!existingCustomer) {
    return null;
  }

  const externalId = getPolarCustomerExternalId(existingCustomer);
  if (externalId === args.billingKey) {
    return existingCustomer;
  }
  if (externalId) {
    console.warn("Refusing to reuse Polar customer linked to another billing key.", {
      polarCustomerId: existingCustomer.id,
    });
    return null;
  }

  try {
    return await client.customers.update({
      id: existingCustomer.id,
      customerUpdate: {
        externalId: args.billingKey,
        type: "team",
        ...(args.billingContactName ? { name: args.billingContactName } : {}),
      },
    });
  } catch (error) {
    console.warn("Failed to attach billing key to existing Polar customer.", {
      error: getErrorMessage(error),
    });
    return null;
  }
}

type PolarSubscriptionLookupResult = {
  subscription: PolarBillingSubscription;
  checkoutId: string | null;
};

function getPolarSubscriptionPriceId(subscription: PolarBillingSubscription): string | undefined {
  return subscription.prices[0]?.id;
}

function selectMatchingPolarSubscription(
  subscriptions: Array<PolarBillingSubscription>,
  input: {
    proProductId: string | undefined;
    expectedCustomerId: string | null;
  },
): PolarBillingSubscription | null {
  const scopedSubscriptions = input.expectedCustomerId
    ? subscriptions.filter((subscription) => subscription.customerId === input.expectedCustomerId)
    : subscriptions;
  return (
    scopedSubscriptions.find(
      (subscription) => subscription.productId === input.proProductId,
    ) ??
    scopedSubscriptions[0] ??
    null
  );
}

async function findPolarSubscriptionForCheckoutSuccess(
  client: PolarClient,
  checkoutContext: CheckoutContext,
  customerSessionToken?: string | null,
): Promise<PolarSubscriptionLookupResult | null> {
  let checkout: PolarCheckout | null = null;
  if (checkoutContext.checkoutId) {
    checkout = await client.checkouts.get({ id: checkoutContext.checkoutId });
    if (checkout.subscriptionId) {
      try {
        const subscription = await client.subscriptions.get({
          id: checkout.subscriptionId,
        });
        return {
          subscription,
          checkoutId: checkout.id,
        };
      } catch (error) {
        if (!customerSessionToken) {
          throw error;
        }
      }
    }
  }

  const proProductId = process.env.POLAR_PRO_PRODUCT_ID?.trim();
  const expectedCustomerId = checkout?.customerId ?? checkoutContext.polarCustomerId;
  if (customerSessionToken) {
    const subscriptions = await client.customerPortal.subscriptions.list(
      { customerSession: customerSessionToken },
      {
        active: true,
        ...(proProductId ? { productId: proProductId } : {}),
        limit: 10,
      },
    );
    let firstSubscription: PolarBillingSubscription | null = null;
    for await (const page of subscriptions) {
      const pageSubscriptions = page.result.items;
      if (!expectedCustomerId) {
        firstSubscription ??= pageSubscriptions[0] ?? null;
      }
      const matchingSubscription = selectMatchingPolarSubscription(pageSubscriptions, {
        proProductId,
        expectedCustomerId,
      });
      if (matchingSubscription) {
        return {
          subscription: matchingSubscription,
          checkoutId:
            matchingSubscription.checkoutId ?? checkout?.id ?? checkoutContext.checkoutId,
        };
      }
    }

    if (expectedCustomerId) {
      return null;
    }

    return firstSubscription
      ? {
          subscription: firstSubscription,
          checkoutId: firstSubscription.checkoutId ?? checkout?.id ?? checkoutContext.checkoutId,
        }
      : null;
  }

  const customerId = checkout?.customerId ?? checkoutContext.polarCustomerId;
  if (!customerId) {
    return null;
  }

  const subscriptions = await client.subscriptions.list({
    customerId,
    active: true,
    limit: 10,
  });
  let firstSubscription: PolarSubscription | null = null;
  for await (const page of subscriptions) {
    const pageSubscriptions = page.result.items;
    firstSubscription ??= pageSubscriptions[0] ?? null;
    const matchingSubscription = selectMatchingPolarSubscription(pageSubscriptions, {
      proProductId,
      expectedCustomerId: customerId,
    });
    if (matchingSubscription) {
      return {
        subscription: matchingSubscription,
        checkoutId: matchingSubscription.checkoutId ?? checkout?.id ?? checkoutContext.checkoutId,
      };
    }
  }

  return firstSubscription
    ? {
        subscription: firstSubscription,
        checkoutId: firstSubscription.checkoutId ?? checkout?.id ?? checkoutContext.checkoutId,
      }
    : null;
}

async function ensurePolarCustomer(
  ctx: ActionCtx,
  args: {
    businessId: Id<"businesses">;
    checkoutContext: CheckoutContext;
  },
): Promise<{
  id: string;
  externalId: string;
}> {
  if (args.checkoutContext.polarCustomerId) {
    return {
      id: args.checkoutContext.polarCustomerId,
      externalId: args.checkoutContext.billingKey,
    };
  }

  if (!args.checkoutContext.billingContactEmail) {
    throw new Error("A billing contact email is required before starting checkout.");
  }

  const client = createPolarClient();
  let customer: PolarCustomer;
  try {
    customer = await client.customers.create({
      type: "team",
      externalId: args.checkoutContext.billingKey,
      email: args.checkoutContext.billingContactEmail,
      ...(args.checkoutContext.billingContactName
        ? { name: args.checkoutContext.billingContactName }
        : {}),
    });
  } catch (error) {
    if (!isDuplicatePolarCustomerEmailError(error)) {
      throw error;
    }

    const existingCustomer = await recoverExistingPolarCustomer(client, {
      billingKey: args.checkoutContext.billingKey,
      billingContactEmail: args.checkoutContext.billingContactEmail,
      billingContactName: args.checkoutContext.billingContactName,
    });
    if (!existingCustomer) {
      throw error;
    }
    customer = existingCustomer;
  }

  await ctx.runMutation(internal.billing.ensureBillingAccountCustomerLink, {
    businessId: args.businessId,
    billingKey: args.checkoutContext.billingKey,
    polarCustomerId: customer.id,
    polarCustomerExternalId: args.checkoutContext.billingKey,
    ...(args.checkoutContext.billingContactEmail
      ? { billingContactEmail: args.checkoutContext.billingContactEmail }
      : {}),
    ...(args.checkoutContext.billingContactName
      ? { billingContactName: args.checkoutContext.billingContactName }
      : {}),
    lastSyncedAt: new Date().toISOString(),
  });

  const existingComponentCustomer = await ctx.runQuery(
    components.polar.lib.getCustomerByUserId,
    { userId: args.checkoutContext.billingKey },
  );

  if (!existingComponentCustomer) {
    await ctx.runMutation(components.polar.lib.insertCustomer, {
      id: customer.id,
      userId: args.checkoutContext.billingKey,
    });
  }

  return {
    id: customer.id,
    externalId: args.checkoutContext.billingKey,
  };
}

function mergeActiveAddon(
  currentAddons: Array<BillingAddonSlug>,
  nextAddon: BillingAddonSlug,
  active: boolean,
): Array<BillingAddonSlug> {
  const next = new Set(currentAddons);
  if (active) {
    next.add(nextAddon);
  } else {
    next.delete(nextAddon);
  }
  return [...next];
}

function shouldRecordAiSmsOrderAsSetupFee(args: {
  orderProductIds: Array<string>;
}): boolean {
  const setupFeeProductId = process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID?.trim();
  return Boolean(setupFeeProductId && args.orderProductIds.includes(setupFeeProductId));
}

export function registerBillingRoutes(http: HttpRouter): void {
  billingPolar.registerRoutes(http as never, {
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
      "product.created": async () => {},
      "product.updated": async () => {},
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
  const billingKey = resolvePolarBillingKey({
    customerExternalId: event.data.customer.externalId ?? null,
    metadata: event.data.metadata,
  });
  const businessId = parseBusinessIdFromBillingKey(billingKey);
  if (!businessId || !billingKey) {
    return;
  }

  await ctx.runMutation(internal.billing.syncSubscriptionFromWebhook, {
    businessId,
    billingKey,
    polarCustomerId: event.data.customerId,
    polarCustomerExternalId: billingKey,
    ...(event.data.customer.email ? { billingContactEmail: event.data.customer.email } : {}),
    ...(event.data.customer.name ? { billingContactName: event.data.customer.name } : {}),
    subscriptionId: event.data.id,
    subscriptionProductId: event.data.productId,
    ...(event.data.prices[0]?.id ? { subscriptionPriceId: event.data.prices[0].id } : {}),
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
    ...(shouldRecordAiSmsOrderAsSetupFee({
      orderProductIds: event.data.productId ? [event.data.productId] : [],
    })
      ? { aiSmsSetupOrderId: event.data.id }
      : {}),
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

export const ensureBillingAccountCustomerLink = internalMutation({
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
    const account = await getBillingAccount(ctx, args.businessId);
    if (account) {
      await ctx.db.patch(account._id, {
        billingKey: args.billingKey,
        polarCustomerId: args.polarCustomerId,
        polarCustomerExternalId: args.polarCustomerExternalId,
        ...(args.billingContactEmail ? { billingContactEmail: args.billingContactEmail } : {}),
        ...(args.billingContactName ? { billingContactName: args.billingContactName } : {}),
        lastSyncedAt: args.lastSyncedAt,
      });
      return null;
    }

    await ctx.db.insert("billing_accounts", {
      businessId: args.businessId,
      billingKey: args.billingKey,
      currentPlan: "free_cloud",
      activeAddons: [],
      polarCustomerId: args.polarCustomerId,
      polarCustomerExternalId: args.polarCustomerExternalId,
      ...(args.billingContactEmail ? { billingContactEmail: args.billingContactEmail } : {}),
      ...(args.billingContactName ? { billingContactName: args.billingContactName } : {}),
      lastSyncedAt: args.lastSyncedAt,
    });
    return null;
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
    const existingAccount = await getBillingAccount(ctx, args.businessId);
    const business = await ctx.db.get(args.businessId);
    const existingPlan = getPlanForBusiness({
      business,
      account: existingAccount,
    });
    const existingAddons = getNormalizedAddons(existingAccount?.activeAddons);
    const isProProduct = args.subscriptionProductId === process.env.POLAR_PRO_PRODUCT_ID?.trim();
    const isAiSmsProduct =
      args.subscriptionProductId === process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID?.trim();
    const subscriptionActive = isActiveSubscriptionStatus(args.subscriptionState);

    const nextPlan: BillingPlanSlug =
      isProProduct && subscriptionActive
        ? "pro"
        : isProProduct && existingPlan !== "enterprise"
          ? "free_cloud"
          : existingPlan;
    const nextActiveAddons = isAiSmsProduct
      ? mergeActiveAddon(existingAddons, "ai_sms", subscriptionActive)
      : existingAddons;

    const patch = {
      businessId: args.businessId,
      billingKey: args.billingKey,
      currentPlan: nextPlan === "self_host" ? "free_cloud" : nextPlan,
      activeAddons: nextActiveAddons,
      polarCustomerId: args.polarCustomerId,
      polarCustomerExternalId: args.polarCustomerExternalId,
      ...(args.billingContactEmail ? { billingContactEmail: args.billingContactEmail } : {}),
      ...(args.billingContactName ? { billingContactName: args.billingContactName } : {}),
      ...(isProProduct ? { subscriptionState: args.subscriptionState } : {}),
      ...(isProProduct ? { proSubscriptionId: args.subscriptionId } : {}),
      ...(isProProduct ? { proSubscriptionProductId: args.subscriptionProductId } : {}),
      ...(isProProduct && args.subscriptionPriceId
        ? { proSubscriptionPriceId: args.subscriptionPriceId }
        : {}),
      ...(isAiSmsProduct ? { aiSmsSubscriptionId: args.subscriptionId } : {}),
      ...(isAiSmsProduct ? { aiSmsSubscriptionProductId: args.subscriptionProductId } : {}),
      ...(isAiSmsProduct && args.subscriptionPriceId
        ? { aiSmsSubscriptionPriceId: args.subscriptionPriceId }
        : {}),
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      ...(args.checkoutId ? { checkoutId: args.checkoutId } : {}),
      lastWebhookEventType: args.lastWebhookEventType,
      lastSyncedAt: args.lastSyncedAt,
    };

    if (existingAccount) {
      await ctx.db.patch(existingAccount._id, patch);
    } else {
      await ctx.db.insert("billing_accounts", patch);
    }

    if (business?.onboardingStage === "plan" && isProProduct && subscriptionActive) {
      await ctx.db.patch(args.businessId, {
        onboardingStage: "attribution",
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
    aiSmsSetupOrderId: v.optional(v.string()),
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

    if (args.aiSmsSetupOrderId) {
      const account = await getBillingAccount(ctx, args.businessId);
      if (account) {
        await ctx.db.patch(account._id, {
          aiSmsSetupOrderId: args.aiSmsSetupOrderId,
          lastSyncedAt: args.lastSyncedAt,
        });
      }
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
    checkoutId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<CheckoutContext> => {
    const currentUser = await requireCurrentUser(ctx);
    const membership = await requireMembership(ctx, args.businessId);
    requireBillingManagementAccess(membership.role);
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
      checkoutId: account?.checkoutId ?? null,
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

export const startCheckout = action({
  args: {
    businessId: v.id("businesses"),
    target: v.union(v.literal("pro"), v.literal("ai_sms")),
  },
  returns: v.object({
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const checkoutContext = await ctx.runQuery(internal.billing.getCheckoutContext, {
      businessId: args.businessId,
    });
    const snapshot = await ctx.runQuery(internal.billing.getSnapshotForCheckout, {
      businessId: args.businessId,
    });

    if (args.target === "pro" && snapshot.plan !== "free_cloud") {
      throw new Error("Only Free workspaces can start Pro checkout.");
    }
    if (args.target === "pro" && !snapshot.availableCheckoutPlans.includes("pro")) {
      throw new Error("Pro checkout is not configured.");
    }
    if (args.target === "ai_sms" && !snapshot.canPurchaseAiSmsAddon) {
      throw new Error("AI SMS add-on is only available for eligible Pro workspaces.");
    }
    const customer = await ensurePolarCustomer(ctx, {
      businessId: args.businessId,
      checkoutContext,
    });
    const siteUrl = getBillingSiteUrl();
    const checkout = await createPolarClient().checkouts.create({
      customerId: customer.id,
      ...(checkoutContext.billingContactEmail
        ? { customerEmail: checkoutContext.billingContactEmail }
        : {}),
      ...(checkoutContext.billingContactName
        ? { customerName: checkoutContext.billingContactName }
        : {}),
      products: getTargetProductIds(args.target),
      successUrl: new URL("/settings/plan?checkout=success", siteUrl).toString(),
      returnUrl: new URL("/settings/plan", siteUrl).toString(),
      embedOrigin: siteUrl.origin,
      customerMetadata: {
        billingKey: checkoutContext.billingKey,
        businessId: String(args.businessId),
      },
      metadata: {
        billingKey: checkoutContext.billingKey,
        businessId: String(args.businessId),
        checkoutTarget: args.target,
      },
    });

    await ctx.runMutation(internal.billing.syncCheckoutSession, {
      businessId: args.businessId,
      checkoutId: checkout.id,
      lastSyncedAt: new Date().toISOString(),
    });

    return { url: checkout.url };
  },
});

export const refreshCheckoutStatus = action({
  args: {
    businessId: v.id("businesses"),
    customerSessionToken: v.optional(v.string()),
  },
  returns: v.object({
    synced: v.boolean(),
    subscriptionId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const checkoutContext: CheckoutContext = await ctx.runQuery(
      internal.billing.getCheckoutContext,
      {
        businessId: args.businessId,
      },
    );
    const lookup = await findPolarSubscriptionForCheckoutSuccess(
      createPolarClient(),
      checkoutContext,
      args.customerSessionToken,
    );
    if (!lookup) {
      return {
        synced: false,
        subscriptionId: null,
      };
    }

    const { subscription, checkoutId } = lookup;
    const subscriptionPriceId = getPolarSubscriptionPriceId(subscription);
    const billingKey =
      resolvePolarBillingKey({
        customerExternalId: subscription.customer?.externalId ?? null,
        metadata: subscription.metadata ?? {},
      }) ?? checkoutContext.billingKey;
    const businessId = parseBusinessIdFromBillingKey(billingKey) ?? args.businessId;
    if (businessId !== args.businessId) {
      throw new Error("Polar subscription belongs to a different business.");
    }

    await ctx.runMutation(internal.billing.syncSubscriptionFromWebhook, {
      businessId,
      billingKey,
      polarCustomerId: subscription.customerId,
      polarCustomerExternalId: billingKey,
      ...(subscription.customer?.email
        ? { billingContactEmail: subscription.customer.email }
        : checkoutContext.billingContactEmail
          ? { billingContactEmail: checkoutContext.billingContactEmail }
          : {}),
      ...(subscription.customer?.name
        ? { billingContactName: subscription.customer.name }
        : checkoutContext.billingContactName
          ? { billingContactName: checkoutContext.billingContactName }
          : {}),
      subscriptionId: subscription.id,
      subscriptionProductId: subscription.productId,
      ...(subscriptionPriceId ? { subscriptionPriceId } : {}),
      subscriptionState: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      ...(checkoutId ? { checkoutId } : {}),
      lastWebhookEventType: "checkout.success.reconcile",
      lastSyncedAt: new Date().toISOString(),
    });

    return {
      synced: true,
      subscriptionId: subscription.id,
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
    const checkoutContext = await ctx.runQuery(internal.billing.getCheckoutContext, {
      businessId: args.businessId,
    });
    const hasCustomerPortalAccess: boolean = await ctx.runQuery(
      internal.billing.getCustomerPortalAccess,
      {
        businessId: args.businessId,
      },
    );
    if (!hasCustomerPortalAccess) {
      throw new Error("A paid subscription is required before opening the customer portal.");
    }

    const customer = await ensurePolarCustomer(ctx, {
      businessId: args.businessId,
      checkoutContext,
    });
    const siteUrl = getBillingSiteUrl();
    const session = await createPolarClient().customerSessions.create({
      customerId: customer.id,
      returnUrl: new URL("/settings/plan", siteUrl).toString(),
    });

    return { url: session.customerPortalUrl };
  },
});

export const getCustomerPortalAccess = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, args.businessId);
    requireBillingManagementAccess(membership.role);

    const account = await getBillingAccount(ctx, args.businessId);
    return hasPolarCustomerPortalAccess(account);
  },
});

export const getSnapshotForCheckout = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    plan: v.union(
      v.literal("self_host"),
      v.literal("free_cloud"),
      v.literal("pro"),
      v.literal("enterprise"),
    ),
    activeAddons: v.array(v.union(v.literal("ai_sms"))),
    availableCheckoutPlans: v.array(v.union(v.literal("pro"))),
    canPurchaseAiSmsAddon: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
    });
    const siteUrlConfigured = Boolean(process.env.SITE_URL?.trim());
    const availableCheckoutPlans = siteUrlConfigured ? getConfiguredCheckoutPlans() : [];

    return {
      plan: snapshot.plan,
      activeAddons: snapshot.activeAddons,
      availableCheckoutPlans,
      canPurchaseAiSmsAddon:
        siteUrlConfigured &&
        isAiSmsAddonCheckoutConfigured() &&
        canPurchaseAiSmsAddon({
          plan: snapshot.plan,
          activeAddons: snapshot.activeAddons,
        }),
    };
  },
});

export const getStatus = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<BillingStatus> => {
    const currentUser = await requireCurrentUser(ctx);
    const membership = await requireMembership(ctx, args.businessId);
    const hasManagementAccess = hasBillingManagementAccess(membership.role);
    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
    });
    const aiSmsEnabled = isAiSmsEnabled({
      plan: snapshot.plan,
      activeAddons: snapshot.activeAddons,
    });
    const contact = hasManagementAccess
      ? await resolveBillingContact(ctx, {
          businessId: args.businessId,
          currentUser,
          account: snapshot.account,
        })
      : {
          email: null,
          name: null,
        };
    const recentTransactions = hasManagementAccess
      ? await ctx.db
          .query("billing_transactions")
          .withIndex("by_business_id_and_occurred_at", (q) => q.eq("businessId", args.businessId))
          .order("desc")
          .take(10)
      : [];
    const knowledgeStorageUsageBytes: number = await ctx.runQuery(
      internal.ai.context.knowledge.getKnowledgeStorageUsageBytes,
      {
        businessId: args.businessId,
      },
    );
    const [registration, phoneNumbers] = aiSmsEnabled && snapshot.plan !== "self_host"
      ? await Promise.all([
          ctx.db
            .query("sms_compliance_registrations")
            .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
            .unique(),
          ctx.db
            .query("phone_numbers")
            .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
            .collect(),
        ])
      : [null, []];
    const aiSmsReady =
      snapshot.plan === "self_host" ||
      (aiSmsEnabled &&
        registration !== null &&
        isSmsComplianceApproved(registration.status) &&
        Boolean(registration.twilioMessagingServiceSid) &&
        Boolean(
          resolveApprovedBusinessSmsSender({
            phoneNumbers,
            ...(registration.approvedPhoneNumberId
              ? { approvedPhoneNumberId: registration.approvedPhoneNumberId }
              : {}),
          }),
        ));
    const siteUrlConfigured = Boolean(process.env.SITE_URL?.trim());
    const availableCheckoutPlans = siteUrlConfigured ? getConfiguredCheckoutPlans() : [];

    return buildBillingStatus({
      billingKey: getBillingKey(args.businessId),
      plan: snapshot.plan,
      activeAddons: snapshot.activeAddons,
      aiSmsReady,
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
      hasBillingManagementAccess: hasManagementAccess,
      hasCustomerPortalAccess: hasPolarCustomerPortalAccess(snapshot.account),
      availableCheckoutPlans,
      aiSmsAddonCheckoutConfigured:
        siteUrlConfigured && isAiSmsAddonCheckoutConfigured(),
      knowledgeStorageUsageBytes,
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
    const membership = await requireMembership(ctx, args.businessId);
    requireBillingManagementAccess(membership.role);
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

export const upsertUsageEvent = internalMutation({
  args: {
    businessId: v.id("businesses"),
    usageKind: v.union(
      v.literal("voice_seconds"),
      v.literal("alert_sms_segments"),
      v.literal("outbound_call_attempts"),
      v.literal("ai_sms_segments"),
    ),
    quantity: v.number(),
    sourceKey: v.string(),
    recordedAt: v.string(),
  },
  returns: v.object({
    usageEventId: v.id("billing_usage_events"),
    plan: v.union(
      v.literal("self_host"),
      v.literal("free_cloud"),
      v.literal("pro"),
      v.literal("enterprise"),
    ),
    activeAddons: v.array(v.union(v.literal("ai_sms"))),
    syncNeeded: v.boolean(),
  }),
  handler: async (ctx, args): Promise<UpsertUsageResult> =>
    await upsertUsageEventInTx(ctx, args),
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
      polarEventName: v.string(),
      polarQuantity: v.number(),
      sourceKey: v.string(),
      recordedAt: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<UsageSyncPayload | null> => {
    const usageEvent = await ctx.db.get(args.usageEventId);
    if (!usageEvent || usageEvent.syncStatus === "succeeded" || usageEvent.syncStatus === "skipped") {
      return null;
    }

    const account = await getBillingAccount(ctx, usageEvent.businessId);
    if (!account?.polarCustomerId) {
      return null;
    }

    if (
      !shouldSyncUsageEvent({
        plan: usageEvent.planAtRecordTime ?? "free_cloud",
        activeAddons: getNormalizedAddons(usageEvent.activeAddonsAtRecordTime),
        usageKind: usageEvent.usageKind,
      })
    ) {
      return null;
    }

    const meteredUsage = getPolarMeteredUsagePayload(
      usageEvent.usageKind,
      usageEvent.quantity,
    );

    return {
      businessId: usageEvent.businessId,
      billingKey: account.billingKey,
      usageKind: usageEvent.usageKind,
      quantity: usageEvent.quantity,
      polarEventName: meteredUsage.eventName,
      polarQuantity: meteredUsage.quantity,
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

export const syncUsageEventToPolar = internalAction({
  args: {
    usageEventId: v.id("billing_usage_events"),
    attempt: v.optional(v.number()),
  },
  returns: v.object({
    synced: v.boolean(),
    scheduledRetry: v.optional(v.boolean()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const attempt = Math.max(0, args.attempt ?? 0);
    const payload = await ctx.runQuery(internal.billing.getUsageSyncPayload, {
      usageEventId: args.usageEventId,
    });

    if (!payload) {
      return { synced: false };
    }

    const syncAttemptedAt = new Date().toISOString();

    try {
      await createPolarClient().events.ingest({
        events: [
          {
            name: payload.polarEventName,
            externalCustomerId: payload.billingKey,
            externalId: payload.sourceKey,
            timestamp: new Date(payload.recordedAt),
            metadata: {
              quantity: payload.polarQuantity,
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

      if (attempt > 0) {
        await emitUsageSyncTelemetry(ctx, {
          eventName: "ops.billing.usage_sync_recovered",
          businessId: payload.businessId,
          usageKind: payload.usageKind,
          quantity: payload.quantity,
          sourceKey: payload.sourceKey,
          attemptNumber: attempt + 1,
          recovered: true,
        });
      }

      return { synced: true };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      let scheduledRetry = false;
      let retryDelayMs: number | undefined;

      if (attempt < USAGE_SYNC_RETRY_DELAYS_MS.length) {
        retryDelayMs = USAGE_SYNC_RETRY_DELAYS_MS[attempt];
        if (retryDelayMs !== undefined) {
          await ctx.scheduler.runAfter(  // Best-effort retry for transient Polar failures.
            retryDelayMs,
            internal.billing.syncUsageEventToPolar,
            {
              usageEventId: args.usageEventId,
              attempt: attempt + 1,
            },
          );
          scheduledRetry = true;
        }
      }

      await ctx.runMutation(internal.billing.markUsageEventSyncResult, {
        usageEventId: args.usageEventId,
        syncStatus: "failed",
        syncAttemptedAt,
        syncError: errorMessage,
      });

      await emitUsageSyncTelemetry(ctx, {
        eventName: "ops.billing.usage_sync_failed",
        businessId: payload.businessId,
        usageKind: payload.usageKind,
        quantity: payload.quantity,
        sourceKey: payload.sourceKey,
        attemptNumber: attempt + 1,
        retryScheduled: scheduledRetry,
        ...(retryDelayMs !== undefined ? { retryDelayMs } : {}),
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      await enqueuePostHogProviderExceptionBestEffort(ctx, {
        provider: "polar",
        error,
        operation: "polar_usage_event_ingest",
        businessId: payload.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(payload.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(payload.businessId)),
        properties: {
          usageKind: payload.usageKind,
          quantity: payload.quantity,
          sourceKey: payload.sourceKey,
          attemptNumber: attempt + 1,
          retryScheduled: scheduledRetry,
          ...(retryDelayMs !== undefined ? { retryDelayMs } : {}),
        },
      });

      return { synced: false, scheduledRetry, error: errorMessage };
    }
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
    plan: v.union(
      v.literal("self_host"),
      v.literal("free_cloud"),
      v.literal("pro"),
      v.literal("enterprise"),
    ),
    activeAddons: v.array(v.union(v.literal("ai_sms"))),
    syncNeeded: v.boolean(),
  }),
  handler: async (ctx, args): Promise<UpsertUsageResult> => {
    return await upsertUsageEventInTx(ctx, {
      businessId: args.businessId,
      usageKind: "voice_seconds",
      quantity: getBillableVoiceUsageSeconds(args.quantity),
      sourceKey: `voice:${String(args.callId)}`,
      recordedAt: args.recordedAt,
    });
  },
});

export const recordAlertSmsUsage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    notificationId: v.optional(v.id("notifications")),
    sourceKey: v.optional(v.string()),
    quantity: v.number(),
    recordedAt: v.string(),
  },
  returns: v.object({
    usageEventId: v.id("billing_usage_events"),
    plan: v.union(
      v.literal("self_host"),
      v.literal("free_cloud"),
      v.literal("pro"),
      v.literal("enterprise"),
    ),
    activeAddons: v.array(v.union(v.literal("ai_sms"))),
    syncNeeded: v.boolean(),
  }),
  handler: async (ctx, args): Promise<UpsertUsageResult> => {
    return await upsertUsageEventInTx(ctx, {
      businessId: args.businessId,
      usageKind: "alert_sms_segments",
      quantity: args.quantity,
      sourceKey: getAlertSmsUsageSourceKey(args),
      recordedAt: args.recordedAt,
    });
  },
});

export const recordAiSmsUsage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    messageId: v.id("messages"),
    quantity: v.number(),
    recordedAt: v.string(),
  },
  returns: v.object({
    usageEventId: v.id("billing_usage_events"),
    plan: v.union(
      v.literal("self_host"),
      v.literal("free_cloud"),
      v.literal("pro"),
      v.literal("enterprise"),
    ),
    activeAddons: v.array(v.union(v.literal("ai_sms"))),
    syncNeeded: v.boolean(),
  }),
  handler: async (ctx, args): Promise<UpsertUsageResult> => {
    return await upsertUsageEventInTx(ctx, {
      businessId: args.businessId,
      usageKind: "ai_sms_segments",
      quantity: args.quantity,
      sourceKey: `ai_sms:${String(args.messageId)}`,
      recordedAt: args.recordedAt,
    });
  },
});

export const recordOutboundCallAttemptUsage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    sourceKey: v.string(),
    quantity: v.number(),
    recordedAt: v.string(),
  },
  returns: v.object({
    usageEventId: v.id("billing_usage_events"),
    plan: v.union(
      v.literal("self_host"),
      v.literal("free_cloud"),
      v.literal("pro"),
      v.literal("enterprise"),
    ),
    activeAddons: v.array(v.union(v.literal("ai_sms"))),
    syncNeeded: v.boolean(),
  }),
  handler: async (ctx, args): Promise<UpsertUsageResult> => {
    return await upsertUsageEventInTx(ctx, {
      businessId: args.businessId,
      usageKind: "outbound_call_attempts",
      quantity: args.quantity,
      sourceKey: args.sourceKey,
      recordedAt: args.recordedAt,
    });
  },
});

export const reserveVoiceUsageAtCallStart = internalMutation({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    recordedAt: v.string(),
  },
  returns: v.object({
    allowed: v.boolean(),
    errorCode: v.union(
      v.literal("voice_limit_reached"),
      v.literal("alert_sms_limit_reached"),
      v.literal("outbound_call_attempt_limit_reached"),
      v.literal("ai_sms_not_enabled"),
      v.null(),
    ),
    usageEventId: v.optional(v.id("billing_usage_events")),
    syncNeeded: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<UsageReservationResult> => {
    const sourceKey = `voice:${String(args.callId)}`;
    const existingUsageEvent = await ctx.db
      .query("billing_usage_events")
      .withIndex("by_business_id_and_source_key", (q) =>
        q.eq("businessId", args.businessId).eq("sourceKey", sourceKey),
      )
      .unique();
    if (existingUsageEvent) {
      return {
        allowed: true,
        errorCode: null,
        usageEventId: existingUsageEvent._id,
        syncNeeded: false,
      };
    }

    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
      at: args.recordedAt,
    });
    const usage = getBillingUsageSnapshotData({
      plan: snapshot.plan,
      periodKey: snapshot.periodKey,
      usage: snapshot.usage,
    });

    if (usage.voiceBlocked) {
      return {
        allowed: false,
        errorCode: billingErrorCodes.voiceLimitReached,
      };
    }

    const reserveQuantity = reserveVoiceSecondsForStart({
      plan: snapshot.plan,
      usage,
    });
    if (reserveQuantity === null) {
      return {
        allowed: true,
        errorCode: null,
      };
    }
    if (reserveQuantity <= 0) {
      return {
        allowed: false,
        errorCode: billingErrorCodes.voiceLimitReached,
      };
    }

    const usageResult = await upsertUsageEventInTx(ctx, {
      businessId: args.businessId,
      usageKind: "voice_seconds",
      quantity: reserveQuantity,
      sourceKey,
      recordedAt: args.recordedAt,
    });

    return {
      allowed: true,
      errorCode: null,
      usageEventId: usageResult.usageEventId,
      syncNeeded: usageResult.syncNeeded,
    };
  },
});

export const reserveAlertSmsUsage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    notificationId: v.optional(v.id("notifications")),
    sourceKey: v.optional(v.string()),
    estimatedSegments: v.number(),
    recordedAt: v.string(),
  },
  returns: v.object({
    allowed: v.boolean(),
    errorCode: v.union(
      v.literal("voice_limit_reached"),
      v.literal("alert_sms_limit_reached"),
      v.literal("outbound_call_attempt_limit_reached"),
      v.literal("ai_sms_not_enabled"),
      v.null(),
    ),
    usageEventId: v.optional(v.id("billing_usage_events")),
    syncNeeded: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<UsageReservationResult> => {
    const sourceKey = getAlertSmsUsageSourceKey(args);
    const existingUsageEvent = await ctx.db
      .query("billing_usage_events")
      .withIndex("by_business_id_and_source_key", (q) =>
        q.eq("businessId", args.businessId).eq("sourceKey", sourceKey),
      )
      .unique();
    if (existingUsageEvent && existingUsageEvent.quantity > 0) {
      return {
        allowed: true,
        errorCode: null,
        usageEventId: existingUsageEvent._id,
        syncNeeded: false,
      };
    }

    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
      at: args.recordedAt,
    });
    const usage = getBillingUsageSnapshotData({
      plan: snapshot.plan,
      periodKey: snapshot.periodKey,
      usage: snapshot.usage,
    });
    const normalizedSegments = Math.max(1, Math.trunc(args.estimatedSegments));
    const overagesBillable = billingPlanCatalog[snapshot.plan].overagesBillable;

    if (usage.alertSmsBlocked) {
      return {
        allowed: false,
        errorCode: billingErrorCodes.alertSmsLimitReached,
      };
    }
    if (
      !overagesBillable &&
      usage.alertSmsSegmentsRemaining !== null &&
      normalizedSegments > usage.alertSmsSegmentsRemaining
    ) {
      return {
        allowed: false,
        errorCode: billingErrorCodes.alertSmsLimitReached,
      };
    }

    const usageResult = await upsertUsageEventInTx(ctx, {
      businessId: args.businessId,
      usageKind: "alert_sms_segments",
      quantity: normalizedSegments,
      sourceKey,
      recordedAt: args.recordedAt,
    });

    return {
      allowed: true,
      errorCode: null,
      usageEventId: usageResult.usageEventId,
      syncNeeded: usageResult.syncNeeded,
    };
  },
});

export const reserveOutboundCallAttemptUsage = internalMutation({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    recordedAt: v.string(),
  },
  returns: v.object({
    allowed: v.boolean(),
    errorCode: v.union(
      v.literal("voice_limit_reached"),
      v.literal("alert_sms_limit_reached"),
      v.literal("outbound_call_attempt_limit_reached"),
      v.literal("ai_sms_not_enabled"),
      v.null(),
    ),
    usageEventId: v.optional(v.id("billing_usage_events")),
    syncNeeded: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<UsageReservationResult> => {
    const sourceKey = `outbound_attempt:voice_call:${String(args.callId)}`;
    const existingUsageEvent = await ctx.db
      .query("billing_usage_events")
      .withIndex("by_business_id_and_source_key", (q) =>
        q.eq("businessId", args.businessId).eq("sourceKey", sourceKey),
      )
      .unique();
    if (existingUsageEvent) {
      return {
        allowed: true,
        errorCode: null,
        usageEventId: existingUsageEvent._id,
        syncNeeded: false,
      };
    }

    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
      at: args.recordedAt,
    });
    const usage = getBillingUsageSnapshotData({
      plan: snapshot.plan,
      periodKey: snapshot.periodKey,
      usage: snapshot.usage,
    });
    const overagesBillable = billingPlanCatalog[snapshot.plan].overagesBillable;

    if (usage.outboundCallAttemptsBlocked) {
      return {
        allowed: false,
        errorCode: billingErrorCodes.outboundCallAttemptLimitReached,
      };
    }
    if (
      !overagesBillable &&
      usage.outboundCallAttemptsRemaining !== null &&
      usage.outboundCallAttemptsRemaining < 1
    ) {
      return {
        allowed: false,
        errorCode: billingErrorCodes.outboundCallAttemptLimitReached,
      };
    }

    const usageResult = await upsertUsageEventInTx(ctx, {
      businessId: args.businessId,
      usageKind: "outbound_call_attempts",
      quantity: 1,
      sourceKey,
      recordedAt: args.recordedAt,
    });

    return {
      allowed: true,
      errorCode: null,
      usageEventId: usageResult.usageEventId,
      syncNeeded: usageResult.syncNeeded,
    };
  },
});

export const releaseOutboundCallAttemptReservation = internalMutation({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    recordedAt: v.string(),
  },
  returns: v.object({
    released: v.boolean(),
    usageEventId: v.optional(v.id("billing_usage_events")),
    syncNeeded: v.optional(v.boolean()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    released: boolean;
    usageEventId?: Id<"billing_usage_events">;
    syncNeeded?: boolean;
  }> => {
    const sourceKey = `outbound_attempt:voice_call:${String(args.callId)}`;
    const existingUsageEvent = await ctx.db
      .query("billing_usage_events")
      .withIndex("by_business_id_and_source_key", (q) =>
        q.eq("businessId", args.businessId).eq("sourceKey", sourceKey),
      )
      .unique();

    if (!existingUsageEvent) {
      return { released: false };
    }

    const usageResult = await upsertUsageEventInTx(ctx, {
      businessId: args.businessId,
      usageKind: "outbound_call_attempts",
      quantity: 0,
      sourceKey,
      recordedAt: args.recordedAt,
    });

    return {
      released: true,
      usageEventId: usageResult.usageEventId,
      syncNeeded: usageResult.syncNeeded,
    };
  },
});

export const getSmsCapabilityPolicy = internalQuery({
  args: {
    businessId: v.id("businesses"),
    capability: v.union(v.literal("alert"), v.literal("ai")),
  },
  returns: v.object({
    allowed: v.boolean(),
    senderRole: v.union(v.literal("platform_alert"), v.literal("business_ai")),
    senderMode: smsSenderModeValidator,
    fromPhoneNumber: v.optional(v.string()),
    twilioMessagingServiceSid: v.optional(v.string()),
    complianceStatus: v.optional(smsComplianceStatusValidator),
    errorCode: v.union(
      v.literal("voice_limit_reached"),
      v.literal("alert_sms_limit_reached"),
      v.literal("outbound_call_attempt_limit_reached"),
      v.literal("ai_sms_not_enabled"),
      v.null(),
    ),
  }),
  handler: async (ctx, args): Promise<SmsCapabilityPolicy> => {
    const [snapshot, registration, phoneNumbers, platformSender] = await Promise.all([
      getBillingSnapshot(ctx, {
        businessId: args.businessId,
      }),
      ctx.db
        .query("sms_compliance_registrations")
        .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
        .unique(),
      ctx.db
        .query("phone_numbers")
        .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
        .collect(),
      ctx.db
        .query("platform_sms_senders")
        .withIndex("by_role", (q) => q.eq("role", "platform_alert"))
        .unique(),
    ]);
    const usage = getBillingUsageSnapshotData({
      plan: snapshot.plan,
      periodKey: snapshot.periodKey,
      usage: snapshot.usage,
    });
    const aiSmsCommerciallyEnabled = isAiSmsEnabled({
      plan: snapshot.plan,
      activeAddons: snapshot.activeAddons,
    });
    const activeBusinessSenderPhoneNumber = selectSmsSenderPhoneNumber(phoneNumbers);
    const approvedBusinessSenderPhoneNumber = resolveApprovedBusinessSmsSender({
      phoneNumbers,
      ...(registration?.approvedPhoneNumberId
        ? { approvedPhoneNumberId: registration.approvedPhoneNumberId }
        : {}),
    });
    const hostedApprovedMessagingRoute =
      snapshot.plan !== "self_host" &&
      aiSmsCommerciallyEnabled &&
      registration &&
      isSmsComplianceApproved(registration.status) &&
      Boolean(registration.twilioMessagingServiceSid) &&
      Boolean(approvedBusinessSenderPhoneNumber);
    const activePlatformSender =
      platformSender && platformSender.status === "active" && platformSender.smsEnabled
        ? platformSender.e164
        : getPlatformAlertSmsSenderFromEnv();

    if (args.capability === "alert") {
      if (snapshot.plan === "self_host") {
        return {
          allowed: !usage.alertSmsBlocked,
          senderRole: "business_ai",
          senderMode: "business_phone",
          ...(activeBusinessSenderPhoneNumber
            ? { fromPhoneNumber: activeBusinessSenderPhoneNumber }
            : {}),
          ...(registration?.status ? { complianceStatus: registration.status } : {}),
          errorCode: usage.alertSmsBlocked ? billingErrorCodes.alertSmsLimitReached : null,
        };
      }

      if (hostedApprovedMessagingRoute) {
        return {
          allowed: !usage.alertSmsBlocked,
          senderRole: "platform_alert",
          senderMode: "business_messaging_service",
          ...(approvedBusinessSenderPhoneNumber
            ? { fromPhoneNumber: approvedBusinessSenderPhoneNumber }
            : {}),
          ...(registration?.twilioMessagingServiceSid
            ? { twilioMessagingServiceSid: registration.twilioMessagingServiceSid }
            : {}),
          ...(registration?.status ? { complianceStatus: registration.status } : {}),
          errorCode: usage.alertSmsBlocked ? billingErrorCodes.alertSmsLimitReached : null,
        };
      }

      return {
        allowed: !usage.alertSmsBlocked,
        senderRole: "platform_alert",
        senderMode: "platform_phone",
        ...(activePlatformSender ? { fromPhoneNumber: activePlatformSender } : {}),
        ...(registration?.status ? { complianceStatus: registration.status } : {}),
        errorCode: usage.alertSmsBlocked ? billingErrorCodes.alertSmsLimitReached : null,
      };
    }

    if (!aiSmsCommerciallyEnabled) {
      return {
        allowed: false,
        senderRole: "business_ai",
        senderMode: snapshot.plan === "self_host" ? "business_phone" : "platform_phone",
        ...(activeBusinessSenderPhoneNumber
          ? { fromPhoneNumber: activeBusinessSenderPhoneNumber }
          : {}),
        ...(registration?.status ? { complianceStatus: registration.status } : {}),
        errorCode: billingErrorCodes.aiSmsNotEnabled,
      };
    }

    if (snapshot.plan === "self_host") {
      return {
        allowed: true,
        senderRole: "business_ai",
        senderMode: "business_phone",
        ...(activeBusinessSenderPhoneNumber
          ? { fromPhoneNumber: activeBusinessSenderPhoneNumber }
          : {}),
        ...(registration?.status ? { complianceStatus: registration.status } : {}),
        errorCode: null,
      };
    }

    if (hostedApprovedMessagingRoute) {
      return {
        allowed: true,
        senderRole: "business_ai",
        senderMode: "business_messaging_service",
        ...(approvedBusinessSenderPhoneNumber
          ? { fromPhoneNumber: approvedBusinessSenderPhoneNumber }
          : {}),
        ...(registration?.twilioMessagingServiceSid
          ? { twilioMessagingServiceSid: registration.twilioMessagingServiceSid }
          : {}),
        ...(registration?.status ? { complianceStatus: registration.status } : {}),
        errorCode: null,
      };
    }

    return {
      allowed: false,
      senderRole: "business_ai",
      senderMode: "platform_phone",
      ...(approvedBusinessSenderPhoneNumber
        ? { fromPhoneNumber: approvedBusinessSenderPhoneNumber }
        : {}),
      ...(registration?.status ? { complianceStatus: registration.status } : {}),
      errorCode: null,
    };
  },
});

export const assertVoiceCanStart = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    allowed: v.boolean(),
    errorCode: v.union(
      v.literal("voice_limit_reached"),
      v.literal("alert_sms_limit_reached"),
      v.literal("outbound_call_attempt_limit_reached"),
      v.literal("ai_sms_not_enabled"),
      v.null(),
    ),
  }),
  handler: async (ctx, args) => {
    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
    });
    const usage = getBillingUsageSnapshotData({
      plan: snapshot.plan,
      periodKey: snapshot.periodKey,
      usage: snapshot.usage,
    });

    return {
      allowed: !usage.voiceBlocked,
      errorCode: usage.voiceBlocked ? billingErrorCodes.voiceLimitReached : null,
    };
  },
});

export const assertOutboundCallAttemptCanStart = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    allowed: v.boolean(),
    errorCode: v.union(
      v.literal("voice_limit_reached"),
      v.literal("alert_sms_limit_reached"),
      v.literal("outbound_call_attempt_limit_reached"),
      v.literal("ai_sms_not_enabled"),
      v.null(),
    ),
  }),
  handler: async (ctx, args) => {
    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
    });
    const usage = getBillingUsageSnapshotData({
      plan: snapshot.plan,
      periodKey: snapshot.periodKey,
      usage: snapshot.usage,
    });

    return {
      allowed: !usage.outboundCallAttemptsBlocked,
      errorCode: usage.outboundCallAttemptsBlocked
        ? billingErrorCodes.outboundCallAttemptLimitReached
        : null,
    };
  },
});

export const getPlatformAlertSmsSender = internalQuery({
  args: {},
  returns: v.union(v.object({ e164: v.string() }), v.null()),
  handler: async (ctx) => {
    const sender = await ctx.db
      .query("platform_sms_senders")
      .withIndex("by_role", (q) => q.eq("role", "platform_alert"))
      .unique();

    if (sender && sender.status === "active" && sender.smsEnabled) {
      return { e164: sender.e164 };
    }

    const envSender = getPlatformAlertSmsSenderFromEnv();
    if (envSender) {
      return { e164: envSender };
    }

    return null;
  },
});

export const seedPlatformAlertSmsSender = internalMutation({
  args: {
    label: v.string(),
    e164: v.string(),
    twilioPhoneSid: v.optional(v.string()),
    twilioMessagingServiceSid: v.optional(v.string()),
    compliantDestinationCountries: v.optional(v.array(v.string())),
  },
  returns: v.id("platform_sms_senders"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("platform_sms_senders")
      .withIndex("by_role", (q) => q.eq("role", "platform_alert"))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        label: args.label,
        e164: args.e164,
        ...(args.twilioPhoneSid ? { twilioPhoneSid: args.twilioPhoneSid } : {}),
        ...(args.twilioMessagingServiceSid
          ? { twilioMessagingServiceSid: args.twilioMessagingServiceSid }
          : {}),
        ...(args.compliantDestinationCountries
          ? { compliantDestinationCountries: args.compliantDestinationCountries }
          : {}),
        status: "active",
        smsEnabled: true,
      });
      return existing._id;
    }

    return await ctx.db.insert("platform_sms_senders", {
      role: "platform_alert",
      label: args.label,
      e164: args.e164,
      ...(args.twilioPhoneSid ? { twilioPhoneSid: args.twilioPhoneSid } : {}),
      ...(args.twilioMessagingServiceSid
        ? { twilioMessagingServiceSid: args.twilioMessagingServiceSid }
        : {}),
      ...(args.compliantDestinationCountries
        ? { compliantDestinationCountries: args.compliantDestinationCountries }
        : {}),
      status: "active",
      smsEnabled: true,
    });
  },
});

export const getPricingSummary = query({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    plan: v.union(
      v.literal("self_host"),
      v.literal("free_cloud"),
      v.literal("pro"),
      v.literal("enterprise"),
    ),
    activeAddons: v.array(v.union(v.literal("ai_sms"))),
    aiSmsEnabled: v.boolean(),
    alertSmsPlatformSenderConfigured: v.boolean(),
    proMonthlyChargeCents: v.number(),
    aiSmsMonthlyChargeCents: v.number(),
    aiSmsSetupChargeCents: v.number(),
  }),
  handler: async (ctx, args): Promise<PricingSummary> => {
    await requireMembership(ctx, args.businessId);
    const snapshot = await getBillingSnapshot(ctx, {
      businessId: args.businessId,
    });
    const platformSender = await ctx.db
      .query("platform_sms_senders")
      .withIndex("by_role", (q) => q.eq("role", "platform_alert"))
      .unique();
    const hasPlatformSender =
      Boolean(platformSender?.smsEnabled && platformSender?.status === "active") ||
      Boolean(getPlatformAlertSmsSenderFromEnv());

    return {
      plan: snapshot.plan,
      activeAddons: snapshot.activeAddons,
      aiSmsEnabled: isAiSmsEnabled({
        plan: snapshot.plan,
        activeAddons: snapshot.activeAddons,
      }),
      alertSmsPlatformSenderConfigured: hasPlatformSender,
      proMonthlyChargeCents: billingPlanCatalog.pro.monthlyChargeCents ?? 0,
      aiSmsMonthlyChargeCents: getAiSmsAddonPricing().recurringMonthlyChargeCents,
      aiSmsSetupChargeCents: getAiSmsAddonPricing().oneTimeSetupChargeCents,
    };
  },
});
