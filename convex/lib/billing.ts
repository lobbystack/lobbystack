import type {
  BillingAddonSlug,
  BillingInterval,
  BillingPlanSlug,
  BillingUsageSnapshot,
  CloudBillingPlanSlug,
  HostedCheckoutPlanSlug,
} from "../../packages/shared/src/billing";
import {
  billingAddonCatalog,
  billingPlanCatalog,
  getKnowledgeStorageLimitBytes as getSharedKnowledgeStorageLimitBytes,
} from "../../packages/shared/src/billing";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Reader = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export function getBillingKey(businessId: Id<"businesses"> | string): string {
  return `business:${String(businessId)}`;
}

export function getBillingPeriodKey(input: Date | number | string = Date.now()): string {
  const date = input instanceof Date ? input : new Date(input);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getBillingResetAt(periodKey: string): string {
  const [yearText, monthText] = periodKey.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return new Date().toISOString();
  }

  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString();
}

export function getNormalizedAddons(
  activeAddons: Array<string> | undefined | null,
): Array<BillingAddonSlug> {
  return (activeAddons ?? []).filter(
    (addon): addon is BillingAddonSlug => addon === "ai_sms",
  );
}

export function getPlanForBusiness(input: {
  business: Pick<Doc<"businesses">, "deploymentMode"> | null;
  account: Pick<Doc<"billing_accounts">, "currentPlan"> | null;
}): BillingPlanSlug {
  if (
    input.business?.deploymentMode &&
    input.business.deploymentMode !== "cloud" &&
    input.business.deploymentMode !== "development"
  ) {
    return "self_host";
  }

  const accountPlan = input.account?.currentPlan;
  if (
    accountPlan === "free_cloud" ||
    accountPlan === "starter" ||
    accountPlan === "pro" ||
    accountPlan === "enterprise"
  ) {
    return accountPlan;
  }

  return "free_cloud";
}

export function isAiSmsEnabled(input: {
  plan: BillingPlanSlug;
  activeAddons: Array<BillingAddonSlug>;
}): boolean {
  if (input.plan === "self_host") {
    return true;
  }
  if (input.plan === "enterprise") {
    return true;
  }

  return input.plan === "pro" && input.activeAddons.includes("ai_sms");
}

export function getPlanEntitlements(plan: BillingPlanSlug) {
  const config = billingPlanCatalog[plan];
  return {
    knowledgeStorageBytes: config.knowledgeStorageBytes,
    voiceSecondsIncluded: config.voiceSecondsIncluded,
    alertSmsSegmentsIncluded: config.alertSmsSegmentsIncluded,
    outboundCallAttemptsIncluded: config.outboundCallAttemptsIncluded,
    includedBusinessNumbers: config.includedBusinessNumbers,
    overagesBillable: config.overagesBillable,
  };
}

export function getKnowledgeStorageLimitBytes(
  plan: BillingPlanSlug,
): number | null {
  return getSharedKnowledgeStorageLimitBytes(plan);
}

export function getBillingUsageSnapshotData(args: {
  plan: BillingPlanSlug;
  usage: Doc<"billing_usage_months"> | null;
  periodKey: string;
}): BillingUsageSnapshot {
  const entitlements = getPlanEntitlements(args.plan);
  const voiceSecondsUsed = args.usage?.voiceSecondsUsed ?? 0;
  const alertSmsSegmentsUsed = args.usage?.alertSmsSegmentsUsed ?? 0;
  const outboundCallAttemptsUsed = args.usage?.outboundCallAttemptsUsed ?? 0;
  const aiSmsSegmentsUsed = args.usage?.aiSmsSegmentsUsed ?? 0;
  const alertSmsSegmentsIncluded = entitlements.alertSmsSegmentsIncluded;

  const voiceSecondsRemaining =
    entitlements.voiceSecondsIncluded === null
      ? null
      : Math.max(0, entitlements.voiceSecondsIncluded - voiceSecondsUsed);
  const alertSmsSegmentsRemaining =
    alertSmsSegmentsIncluded === null
      ? null
      : Math.max(0, alertSmsSegmentsIncluded - alertSmsSegmentsUsed);
  const outboundCallAttemptsRemaining =
    entitlements.outboundCallAttemptsIncluded === null
      ? null
      : Math.max(0, entitlements.outboundCallAttemptsIncluded - outboundCallAttemptsUsed);

  return {
    periodKey: args.periodKey,
    resetAt: getBillingResetAt(args.periodKey),
    knowledgeStorageBytesUsed: 0,
    knowledgeStorageBytesIncluded: entitlements.knowledgeStorageBytes,
    voiceSecondsUsed,
    alertSmsSegmentsUsed,
    outboundCallAttemptsUsed,
    aiSmsSegmentsUsed,
    voiceSecondsIncluded: entitlements.voiceSecondsIncluded,
    alertSmsSegmentsIncluded,
    outboundCallAttemptsIncluded: entitlements.outboundCallAttemptsIncluded,
    voiceSecondsRemaining,
    alertSmsSegmentsRemaining,
    outboundCallAttemptsRemaining,
    voiceBlocked:
      entitlements.overagesBillable || entitlements.voiceSecondsIncluded === null
        ? false
        : args.usage?.voiceBlocked ?? voiceSecondsUsed >= entitlements.voiceSecondsIncluded,
    alertSmsBlocked:
      entitlements.overagesBillable || alertSmsSegmentsIncluded === null
        ? false
        : (args.usage?.alertSmsBlocked ?? false) ||
          alertSmsSegmentsUsed >= alertSmsSegmentsIncluded,
    outboundCallAttemptsBlocked:
      entitlements.overagesBillable ||
      entitlements.outboundCallAttemptsIncluded === null
        ? false
        : args.usage?.outboundCallAttemptsBlocked ??
          outboundCallAttemptsUsed >= entitlements.outboundCallAttemptsIncluded,
    knowledgeStorageBlocked: false,
  };
}

export async function getBillingAccount(
  ctx: Reader,
  businessId: Id<"businesses">,
): Promise<Doc<"billing_accounts"> | null> {
  return await ctx.db
    .query("billing_accounts")
    .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
    .unique();
}

export async function getBillingUsageMonth(
  ctx: Reader,
  args: {
    businessId: Id<"businesses">;
    periodKey: string;
  },
): Promise<Doc<"billing_usage_months"> | null> {
  return await ctx.db
    .query("billing_usage_months")
    .withIndex("by_business_id_and_period_key", (q) =>
      q.eq("businessId", args.businessId).eq("periodKey", args.periodKey),
    )
    .unique();
}

export async function getBillingSnapshot(
  ctx: Reader,
  args: {
    businessId: Id<"businesses">;
    at?: string;
  },
): Promise<{
  business: Doc<"businesses"> | null;
  account: Doc<"billing_accounts"> | null;
  periodKey: string;
  plan: BillingPlanSlug;
  activeAddons: Array<BillingAddonSlug>;
  usage: Doc<"billing_usage_months"> | null;
}> {
  const [business, account] = await Promise.all([
    ctx.db.get(args.businessId),
    getBillingAccount(ctx, args.businessId),
  ]);
  const plan = getPlanForBusiness({ business, account });
  const periodKey = getBillingPeriodKey(args.at ?? Date.now());
  const activeAddons = getNormalizedAddons(account?.activeAddons);
  const usage = await getBillingUsageMonth(ctx, {
    businessId: args.businessId,
    periodKey,
  });

  return {
    business,
    account,
    periodKey,
    plan,
    activeAddons,
    usage,
  };
}

export type HostedCheckoutPlanProduct = {
  plan: HostedCheckoutPlanSlug;
  billingInterval: BillingInterval;
  productId: string;
};

function getOptionalProductId(envName: string): string | null {
  return process.env[envName]?.trim() || null;
}

export function getHostedCheckoutPlanProductMappings(): Array<HostedCheckoutPlanProduct> {
  const proMonthlyProductId =
    getOptionalProductId("POLAR_PRO_MONTHLY_PRODUCT_ID") ??
    getOptionalProductId("POLAR_PRO_PRODUCT_ID");
  const mappings: Array<{
    plan: HostedCheckoutPlanSlug;
    billingInterval: BillingInterval;
    productId: string | null;
  }> = [
    {
      plan: "starter",
      billingInterval: "monthly",
      productId: getOptionalProductId("POLAR_STARTER_MONTHLY_PRODUCT_ID"),
    },
    {
      plan: "starter",
      billingInterval: "annual",
      productId: getOptionalProductId("POLAR_STARTER_ANNUAL_PRODUCT_ID"),
    },
    {
      plan: "pro",
      billingInterval: "monthly",
      productId: proMonthlyProductId,
    },
    {
      plan: "pro",
      billingInterval: "annual",
      productId: getOptionalProductId("POLAR_PRO_ANNUAL_PRODUCT_ID"),
    },
  ];

  return mappings.flatMap((mapping) => {
    return mapping.productId
      ? [
          {
            plan: mapping.plan,
            billingInterval: mapping.billingInterval,
            productId: mapping.productId,
          },
        ]
      : [];
  });
}

export function getConfiguredCheckoutPlans(): Array<HostedCheckoutPlanSlug> {
  const configuredPlans = new Set<HostedCheckoutPlanSlug>();
  for (const mapping of getHostedCheckoutPlanProductMappings()) {
    configuredPlans.add(mapping.plan);
  }
  return [...configuredPlans];
}

export function getConfiguredBillingIntervalsForPlan(
  plan: HostedCheckoutPlanSlug,
): Array<BillingInterval> {
  return getHostedCheckoutPlanProductMappings()
    .filter((mapping) => mapping.plan === plan)
    .map((mapping) => mapping.billingInterval);
}

export function getHostedCheckoutPlanProductId(input: {
  plan: HostedCheckoutPlanSlug;
  billingInterval: BillingInterval;
}): string {
  const mapping = getHostedCheckoutPlanProductMappings().find(
    (candidate) =>
      candidate.plan === input.plan &&
      candidate.billingInterval === input.billingInterval,
  );
  if (!mapping) {
    const envName =
      input.plan === "starter"
        ? input.billingInterval === "annual"
          ? "POLAR_STARTER_ANNUAL_PRODUCT_ID"
          : "POLAR_STARTER_MONTHLY_PRODUCT_ID"
        : input.billingInterval === "annual"
          ? "POLAR_PRO_ANNUAL_PRODUCT_ID"
          : "POLAR_PRO_MONTHLY_PRODUCT_ID";
    throw new Error(`${envName} is required.`);
  }
  return mapping.productId;
}

export function getHostedCheckoutPlanForProductId(
  productId: string,
): { plan: HostedCheckoutPlanSlug; billingInterval: BillingInterval } | null {
  const mapping = getHostedCheckoutPlanProductMappings().find(
    (candidate) => candidate.productId === productId,
  );
  if (mapping) {
    return {
      plan: mapping.plan,
      billingInterval: mapping.billingInterval,
    };
  }

  const legacyProProductId = getOptionalProductId("POLAR_PRO_PRODUCT_ID");
  const legacyProAiSmsProductId = getOptionalProductId("POLAR_PRO_AI_SMS_PRODUCT_ID");
  if (productId === legacyProProductId || productId === legacyProAiSmsProductId) {
    return { plan: "pro", billingInterval: "monthly" };
  }

  return null;
}

export function isAiSmsAddonCheckoutConfigured(): boolean {
  return Boolean(
    process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID?.trim() &&
      process.env.POLAR_PRO_AI_SMS_PRODUCT_ID?.trim(),
  );
}

export function getProProductId(): string {
  return getHostedCheckoutPlanProductId({
    plan: "pro",
    billingInterval: "monthly",
  });
}

export function getAiSmsAddonProductId(): string {
  const productId = process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID?.trim();
  if (!productId) {
    throw new Error("POLAR_AI_SMS_ADDON_PRODUCT_ID is required.");
  }
  return productId;
}

export function getAiSmsSetupProductId(): string {
  const productId = process.env.POLAR_AI_SMS_SETUP_PRODUCT_ID?.trim();
  if (!productId) {
    throw new Error("POLAR_AI_SMS_SETUP_PRODUCT_ID is required.");
  }
  return productId;
}

export function getProAiSmsProductId(): string {
  const productId = process.env.POLAR_PRO_AI_SMS_PRODUCT_ID?.trim();
  if (!productId) {
    throw new Error("POLAR_PRO_AI_SMS_PRODUCT_ID is required.");
  }
  return productId;
}

export function canPurchaseAiSmsAddon(input: {
  plan: BillingPlanSlug;
  activeAddons: Array<BillingAddonSlug>;
}): boolean {
  return input.plan === "pro" && !input.activeAddons.includes("ai_sms");
}

export function deriveCloudPlanFromProductIds(input: {
  account: Doc<"billing_accounts"> | null;
  subscriptionProductIds: Array<string>;
}): CloudBillingPlanSlug {
  if (input.account?.currentPlan === "enterprise") {
    return "enterprise";
  }

  for (const productId of input.subscriptionProductIds) {
    const planProduct = getHostedCheckoutPlanForProductId(productId);
    if (planProduct) {
      return planProduct.plan;
    }
  }

  return "free_cloud";
}

export function deriveActiveAddonsFromProductIds(
  subscriptionProductIds: Array<string>,
): Array<BillingAddonSlug> {
  const aiSmsProductIds = [
    process.env.POLAR_PRO_AI_SMS_PRODUCT_ID?.trim(),
    process.env.POLAR_AI_SMS_ADDON_PRODUCT_ID?.trim(),
  ].filter((productId): productId is string => Boolean(productId));
  if (aiSmsProductIds.some((productId) => subscriptionProductIds.includes(productId))) {
    return ["ai_sms"];
  }
  return [];
}

export function getAiSmsAddonPricing() {
  return billingAddonCatalog.ai_sms;
}
